import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createProjectService } from "../project-service.js";
import { resolveDefaultMigrationsUrl } from "../project-store.js";
import { reportStartupFailure } from "../../main.js";

describe("AI Tool test migration", () => {
  it("reports incomplete development migration 032 safely without modifying existing records", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-test-old-032-"));
    const baseline = mkdtempSync(join(tmpdir(), "ai-test-old-schema-"));
    const source = resolveDefaultMigrationsUrl();
    let projects: ReturnType<typeof createProjectService> | undefined;
    try {
      for (const name of readdirSync(source).filter((name) => Number.parseInt(name, 10) <= 32)) {
        const sql = readFileSync(new URL(name, source), "utf8");
        writeFileSync(join(baseline, name), name.startsWith("032_") ? sql.split("CREATE TABLE ai_test_calls")[0] : sql);
      }
      projects = createProjectService({ dataRoot: root, migrationsUrl: pathToFileURL(`${baseline}/`) });
      const project = projects.create("Keep fixture-private-value");
      projects.close();
      projects = createProjectService({ dataRoot: root });
      let failure: unknown;
      try { projects.open(project.id); } catch (error) { failure = error; }
      const messages: string[] = [];
      reportStartupFailure(failure, (message) => messages.push(message));
      expect(messages.join("\n")).toContain("Project database migration 033 failed");
      expect(messages.join("\n")).toContain("Back up");
      expect(messages.join("\n")).not.toContain("fixture-private-value");
      const db = new Database(join(root, "projects", project.id, "project.sqlite"), { readonly: true });
      try {
        expect(db.prepare("SELECT max(version) AS version FROM schema_migrations").get()).toEqual({ version: 32 });
        expect(db.prepare("SELECT name FROM projects").get()).toEqual({ name: "Keep fixture-private-value" });
        expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'history_clear_jobs'").get()).toBeUndefined();
      } finally { db.close(); }
    } finally {
      projects?.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(baseline, { recursive: true, force: true });
    }
  });
  it("upgrades 029 without rewriting existing data and rejects cross-project references", () => {
    const root = mkdtempSync(join(tmpdir(), "ai-test-migration-"));
    const baseline = mkdtempSync(join(tmpdir(), "ai-test-baseline-"));
    const source = resolveDefaultMigrationsUrl();
    let projects: ReturnType<typeof createProjectService> | undefined;
    try {
      for (const name of readdirSync(source).filter((name) => Number.parseInt(name, 10) <= 29)) {
        cpSync(new URL(name, source), join(baseline, name));
      }
      projects = createProjectService({ dataRoot: root, migrationsUrl: pathToFileURL(`${baseline}/`) });
      const project = projects.create("Retained project");
      const previous = projects.open(project.id).database.prepare("SELECT * FROM projects").all();
      projects.close();
      projects = createProjectService({ dataRoot: root });
      const db = projects.open(project.id).database;
      expect(db.prepare("SELECT * FROM projects").all()).toEqual(previous);
      expect(db.prepare("SELECT max(version) AS version FROM schema_migrations").get()).toEqual({ version: 34 });
      expect(db.pragma("foreign_key_check")).toEqual([]);
      db.prepare(`INSERT INTO ai_test_units
        (id, project_id, connection_identity, tool_name, created_at, updated_at)
        VALUES ('unit', ?, 'connection', 'tool', 'now', 'now')`).run(project.id);
      expect(() => db.prepare(`INSERT INTO ai_test_unit_versions
        (id, project_id, unit_id, version_number, payload_json, created_at)
        VALUES ('version', 'wrong-project', 'unit', 1, '{}', 'now')`).run()).toThrow();
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      projects?.close();
      rmSync(root, { recursive: true, force: true });
      rmSync(baseline, { recursive: true, force: true });
    }
  });
});
