import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { ProjectSummary } from "./project-registry.js";

interface Migration {
  version: number;
  sql: string;
}

export class ProjectMigrationError extends Error {
  constructor(readonly migrationVersion: number, cause: unknown) {
    super(`Project database migration ${String(migrationVersion).padStart(3, "0")} failed. Back up the data directory and restore a compatible backup or request database repair. Do not delete valuable data.`, { cause });
    this.name = "ProjectMigrationError";
  }
}

export function resolveDefaultMigrationsUrl(moduleUrl: URL = new URL(import.meta.url)): URL {
  const sourceLayout = new URL("./migrations/", moduleUrl);
  if (existsSync(fileURLToPath(sourceLayout))) return sourceLayout;

  const bundledLayout = new URL("./projects/migrations/", moduleUrl);
  if (existsSync(fileURLToPath(bundledLayout))) return bundledLayout;

  throw new Error("Project migrations directory is missing");
}

export interface StoredProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  retentionDays: number;
  retentionCount: number;
}

function discoverMigrations(migrationsUrl: URL): Migration[] {
  const directory = fileURLToPath(migrationsUrl);
  const migrations = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => {
      const match = /^(\d+)_.*\.sql$/.exec(name);
      if (match === null) {
        throw new Error(`Invalid migration filename: ${name}`);
      }
      return {
        version: Number.parseInt(match[1], 10),
        sql: readFileSync(new URL(name, migrationsUrl), "utf8"),
      };
    })
    .sort((left, right) => left.version - right.version);

  for (let index = 0; index < migrations.length; index += 1) {
    const current = migrations[index];
    if (!Number.isSafeInteger(current.version) || current.version <= 0) {
      throw new Error("Migration versions must be positive integers");
    }
    if (index > 0 && migrations[index - 1].version === current.version) {
      throw new Error(`Duplicate migration version: ${current.version}`);
    }
    if (current.version !== index + 1) {
      throw new Error(`Project migration versions must be contiguous; expected ${index + 1}`);
    }
  }
  return migrations;
}

export class ProjectStore {
  private connection: Database.Database;
  private maintenance = false;
  private readonly databasePath: string;

  get database(): Database.Database {
    if (this.maintenance) throw new Error("PROJECT_MAINTENANCE");
    return this.connection;
  }

  beginMaintenance(): { databasePath: string; release(): void } {
    if (this.maintenance) throw new Error("PROJECT_MAINTENANCE");
    this.connection.close();
    this.maintenance = true;
    let released = false;
    return { databasePath: this.databasePath, release: () => {
      if (released) return;
      const db = new Database(this.databasePath);
      db.pragma("foreign_keys = ON"); db.pragma("journal_mode = WAL"); db.pragma("busy_timeout = 5000");
      db.prepare("UPDATE project_maintenance SET active = 0, owner_pid = NULL WHERE singleton = 1").run();
      this.connection = db; this.maintenance = false; released = true;
    } };
  }

  constructor(options: {
    databasePath: string;
    project: ProjectSummary;
    migrationsUrl?: URL;
  }) {
    mkdirSync(dirname(options.databasePath), { recursive: true });
    this.databasePath = options.databasePath;
    this.connection = new Database(options.databasePath);

    try {
      this.database.pragma("foreign_keys = ON");
      this.database.pragma("journal_mode = WAL");
      this.database.pragma("busy_timeout = 5000");
      this.applyMigrations(options.migrationsUrl ?? resolveDefaultMigrationsUrl());
      this.database.prepare(`
        INSERT OR IGNORE INTO projects (id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(
        options.project.id,
        options.project.name,
        options.project.createdAt,
        options.project.updatedAt,
      );
    } catch (error) {
      this.database.close();
      throw error;
    }
  }

  private applyMigrations(migrationsUrl: URL): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const appliedVersions = (
      this.database.prepare(
        "SELECT version FROM schema_migrations ORDER BY version",
      ).all() as Array<{ version: number }>
    ).map(({ version }) => version);
    const migrations = discoverMigrations(migrationsUrl);

    const isOrderedPrefix =
      appliedVersions.length <= migrations.length &&
      appliedVersions.every((version, index) => migrations[index]?.version === version);
    if (!isOrderedPrefix) {
      throw new Error("Project migration history is invalid");
    }

    for (const migration of migrations.slice(appliedVersions.length)) {
      try {
        this.database.transaction(() => {
          this.database.exec(migration.sql);
          this.database.prepare(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          ).run(migration.version, new Date().toISOString());
        })();
      } catch (error) { throw new ProjectMigrationError(migration.version, error); }
    }
  }

  getProject(): StoredProject {
    const row = this.database.prepare(`
      SELECT id, name, created_at, updated_at, retention_days, retention_count
      FROM projects
      LIMIT 1
    `).get() as {
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
      retention_days: number;
      retention_count: number;
    } | undefined;
    if (row === undefined) throw new Error("Project metadata is missing");
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      retentionDays: row.retention_days,
      retentionCount: row.retention_count,
    };
  }

  close(): void {
    this.database.close();
  }
}
