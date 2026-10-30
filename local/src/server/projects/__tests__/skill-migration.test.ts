import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectService } from "../project-service.js";
import { ProjectStore, resolveDefaultMigrationsUrl } from "../project-store.js";

describe("project Skill migration", () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

  function copyMigrations(target: string, through: number): void {
    const source = resolveDefaultMigrationsUrl();
    for (const name of readdirSync(source).filter((entry) => Number.parseInt(entry.slice(0, 3), 10) <= through)) {
      cpSync(new URL(name, source), join(target, name));
    }
  }

  it("creates the unified Skill tables on a fresh project", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "skill-migration-fresh-"));
    roots.push(dataRoot);
    const projects = createProjectService({ dataRoot });
    try {
      const project = projects.create("Skill fixture");
      const database = projects.open(project.id).database;
      expect(database.prepare("SELECT max(version) AS version FROM schema_migrations").get()).toEqual({ version: 34 });
      const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
        .map(({ name }) => name);
      expect(tables).toEqual(expect.arrayContaining([
        "project_skills", "project_skill_revisions", "project_skill_validations", "project_skill_mutation_keys",
      ]));
    } finally { projects.close(); }
  });

  it("upgrades a migration-028 project without changing its data", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "skill-migration-upgrade-"));
    const baseline = mkdtempSync(join(tmpdir(), "skill-migration-028-"));
    roots.push(dataRoot, baseline);
    copyMigrations(baseline, 28);
    const legacy = createProjectService({ dataRoot, migrationsUrl: pathToFileURL(`${baseline}/`) });
    const project = legacy.create("Preserved project");
    legacy.close();

    const upgraded = createProjectService({ dataRoot });
    try {
      const database = upgraded.open(project.id).database;
      expect(database.prepare("SELECT max(version) AS version FROM schema_migrations").get()).toEqual({ version: 34 });
      expect(database.prepare("SELECT name FROM projects WHERE id = ?").get(project.id)).toEqual({ name: "Preserved project" });
    } finally { upgraded.close(); }
  });

  it("enforces origin, state, revision, foreign-key, JSON-size, and immutability constraints", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "skill-migration-constraints-"));
    roots.push(dataRoot);
    const projects = createProjectService({ dataRoot });
    const project = projects.create("Constraints");
    try {
      const database = projects.open(project.id).database;
      const now = "2026-09-14T00:00:00.000Z";
      const skillId = "00000000-0000-4000-8000-000000000711";
      const insertSkill = database.prepare(`INSERT INTO project_skills
        (id, project_id, origin, standard_key, slug, name, description, state, revision,
         published_revision, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, 'Sample', 'Use when testing.', ?, 1, NULL, ?, ?, ?)`);
      insertSkill.run(skillId, project.id, "USER", null, "sample", "ACTIVE", now, now, null);
      expect(() => insertSkill.run("00000000-0000-4000-8000-000000000712", project.id,
        "STANDARD", null, "invalid-standard", "ACTIVE", now, now, null)).toThrow();
      expect(() => insertSkill.run("00000000-0000-4000-8000-000000000713", project.id,
        "USER", null, "sample", "ACTIVE", now, now, null)).toThrow();
      expect(() => insertSkill.run("00000000-0000-4000-8000-000000000714", project.id,
        "USER", null, "deleted-without-time", "DELETED", now, now, null)).toThrow();

      const revisionId = "00000000-0000-4000-8000-000000000715";
      database.prepare(`INSERT INTO project_skill_revisions
        (id, project_id, skill_id, revision, version, content_digest, files_json, created_at, published_at)
        VALUES (?, ?, ?, 1, 'r1', ?, ?, ?, NULL)`)
        .run(revisionId, project.id, skillId, "a".repeat(64), JSON.stringify({ "SKILL.md": "valid" }), now);
      expect(() => database.prepare(`INSERT INTO project_skill_revisions
        (id, project_id, skill_id, revision, version, content_digest, files_json, created_at, published_at)
        VALUES (?, ?, ?, 1, 'duplicate', ?, '{}', ?, NULL)`)
        .run("00000000-0000-4000-8000-000000000718", project.id, skillId, "d".repeat(64), now)).toThrow();
      expect(() => database.prepare("UPDATE project_skill_revisions SET version = 'r2' WHERE id = ?").run(revisionId)).toThrow();
      database.prepare("UPDATE project_skill_revisions SET published_at = ? WHERE id = ?").run(now, revisionId);
      expect(database.prepare("SELECT published_at FROM project_skill_revisions WHERE id = ?").get(revisionId))
        .toEqual({ published_at: now });
      expect(() => database.prepare("UPDATE project_skill_revisions SET published_at = ? WHERE id = ?")
        .run("2026-09-14T00:00:01.000Z", revisionId)).toThrow();
      expect(() => database.prepare(`INSERT INTO project_skill_revisions
        (id, project_id, skill_id, revision, version, content_digest, files_json, created_at, published_at)
        VALUES (?, ?, ?, 2, 'r2', ?, ?, ?, NULL)`)
        .run("00000000-0000-4000-8000-000000000716", project.id, skillId, "b".repeat(64),
          JSON.stringify({ "SKILL.md": "x".repeat(1_048_576) }), now)).toThrow();
      expect(() => database.prepare(`INSERT INTO project_skill_revisions
        (id, project_id, skill_id, revision, version, content_digest, files_json, created_at, published_at)
        VALUES (?, ?, '00000000-0000-4000-8000-000000009999', 1, 'r1', ?, '{}', ?, NULL)`)
        .run("00000000-0000-4000-8000-000000000717", project.id, "c".repeat(64), now)).toThrow();

      database.prepare(`INSERT INTO project_skill_validations
        (id, project_id, skill_id, revision, content_digest, validation_digest, valid, issues_json, created_at)
        VALUES (?, ?, ?, 1, ?, ?, 1, '[]', ?)`)
        .run("00000000-0000-4000-8000-000000000719", project.id, skillId,
          "a".repeat(64), "e".repeat(64), now);
      expect(() => database.prepare(`INSERT INTO project_skill_validations
        (id, project_id, skill_id, revision, content_digest, validation_digest, valid, issues_json, created_at)
        VALUES (?, ?, ?, 1, ?, ?, 0, '[]', ?)`)
        .run("00000000-0000-4000-8000-000000000720", project.id, skillId,
          "f".repeat(64), "1".repeat(64), now)).toThrow();

      database.prepare("UPDATE project_skills SET published_revision = 1 WHERE project_id = ? AND id = ?")
        .run(project.id, skillId);
      expect(() => database.prepare("UPDATE project_skills SET published_revision = 2 WHERE project_id = ? AND id = ?")
        .run(project.id, skillId)).toThrow();

      insertSkill.run("00000000-0000-4000-8000-000000000721", project.id,
        "STANDARD", "mcp-inspector/sample", "standard-sample", "ACTIVE", now, now, null);
      expect(() => insertSkill.run("00000000-0000-4000-8000-000000000722", project.id,
        "STANDARD", "mcp-inspector/sample", "standard-sample-two", "ACTIVE", now, now, null)).toThrow();
    } finally { projects.close(); }
  });

  it("rolls migration 029 back atomically when its SQL fails", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "skill-migration-rollback-"));
    const baseline = mkdtempSync(join(tmpdir(), "skill-migration-baseline-"));
    const failing = mkdtempSync(join(tmpdir(), "skill-migration-failing-"));
    roots.push(dataRoot, baseline, failing);
    copyMigrations(baseline, 28);
    const legacy = createProjectService({ dataRoot, migrationsUrl: pathToFileURL(`${baseline}/`) });
    const project = legacy.create("Rollback");
    legacy.close();
    copyMigrations(failing, 28);
    writeFileSync(join(failing, "029_injected_failure.sql"), "CREATE TABLE skill_partial (id TEXT); THIS IS NOT SQL;");
    const databasePath = join(dataRoot, "projects", project.id, "project.sqlite");
    expect(() => new ProjectStore({ databasePath, project, migrationsUrl: pathToFileURL(`${failing}/`) })).toThrow();
    const database = new Database(databasePath);
    try {
      expect(database.prepare("SELECT max(version) AS version FROM schema_migrations").get()).toEqual({ version: 28 });
      expect(database.prepare("SELECT name FROM sqlite_master WHERE name = 'skill_partial'").get()).toBeUndefined();
    } finally { database.close(); }
  });
});
