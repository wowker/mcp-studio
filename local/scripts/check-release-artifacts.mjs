import { mkdtemp, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  RELEASE_BUDGETS,
  assertWithinBudget,
  initialAssetPaths,
  measureGzipBytes,
  validateProductionEntry,
  validatePublishedFiles,
  validateReleaseManifest,
} from "./release-artifact-policy.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const clientRoot = join(root, "dist", "client");
const indexHtml = await readFile(join(clientRoot, "index.html"), "utf8");
const requiredClientFiles = ["dist/client/index.html",
  ...(await readdir(join(clientRoot, "assets"))).map((name) => `dist/client/assets/${name}`)];
const initial = initialAssetPaths(indexHtml);
const readAssets = async (paths) => Promise.all(paths.map((path) => readFile(join(clientRoot, path.replace(/^\//u, "")))));
const [javascript, css] = await Promise.all([readAssets(initial.javascript), readAssets(initial.css)]);
const javascriptBytes = measureGzipBytes(javascript);
const cssBytes = measureGzipBytes(css);
assertWithinBudget("Initial JavaScript", javascriptBytes, RELEASE_BUDGETS.initialJavaScriptGzipBytes);
assertWithinBudget("Initial CSS", cssBytes, RELEASE_BUDGETS.initialCssGzipBytes);

const migrationDirectories = ["projects/migrations", "registry/migrations"];
let migrationCount = 0;
const requiredMigrationFiles = [];
for (const directory of migrationDirectories) {
  const sourceMigrationRoot = join(root, "src", "server", directory);
  const bundledMigrationRoot = join(root, "dist", "server", directory);
  const migrationNames = (await readdir(sourceMigrationRoot)).filter((name) => name.endsWith(".sql")).sort();
  const bundledNames = (await readdir(bundledMigrationRoot)).filter((name) => name.endsWith(".sql")).sort();
  if (JSON.stringify(migrationNames) !== JSON.stringify(bundledNames)) {
    throw new Error(`Bundled ${directory} filenames do not match source migrations`);
  }
  migrationCount += migrationNames.length;
  requiredMigrationFiles.push(...migrationNames.map((name) => `dist/server/${directory}/${name}`));
  for (const name of migrationNames) {
    const [source, bundled] = await Promise.all([
      readFile(join(sourceMigrationRoot, name)),
      readFile(join(bundledMigrationRoot, name)),
    ]);
    if (!source.equals(bundled)) throw new Error(`Bundled migration differs from source: ${directory}/${name}`);
  }
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}

const sourceSkillRoot = join(root, "src", "server", "skills", "standard");
const bundledSkillRoot = join(root, "dist", "server", "skills", "standard");
const skillFiles = await listFiles(sourceSkillRoot);
const bundledSkillFiles = await listFiles(bundledSkillRoot);
if (JSON.stringify(skillFiles) !== JSON.stringify(bundledSkillFiles)) {
  throw new Error("Bundled standard Skill filenames do not match source assets");
}
for (const name of skillFiles) {
  const [source, bundled] = await Promise.all([readFile(join(sourceSkillRoot, name)), readFile(join(bundledSkillRoot, name))]);
  if (!source.equals(bundled)) throw new Error(`Bundled standard Skill differs from source: ${name}`);
}
const requiredSkillFiles = skillFiles.map((name) => `dist/server/skills/standard/${name}`);

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const manifestResult = validateReleaseManifest(manifest);
validateProductionEntry(await readFile(join(root, "dist", "server", "main.js"), "utf8"));
const npmCache = await mkdtemp(join(tmpdir(), "mcp-inspector-release-cache-"));
const releaseRoot = join(root, ".release");
const releaseArtifact = join(releaseRoot, "package.tgz");
let packageResult;
try {
  await rm(releaseRoot, { recursive: true, force: true });
  await mkdir(releaseRoot, { recursive: true });
  const pack = spawnSync(npmCommand, ["pack", "--json", "--ignore-scripts", "--pack-destination", releaseRoot], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, npm_config_cache: npmCache, npm_config_update_notifier: "false" },
  });
  if (pack.status !== 0) throw new Error(`npm pack failed:\n${pack.stderr || pack.stdout}`);
  const packageReport = JSON.parse(pack.stdout);
  packageResult = validatePublishedFiles(packageReport[0]?.files ?? [], { requiredFiles: [
    ...requiredClientFiles,
    ...requiredMigrationFiles,
    ...requiredSkillFiles,
    "dist/server/projects/storage-reclaim-worker.js",
  ] });
  const packedName = packageReport[0]?.filename;
  if (typeof packedName !== "string" || packedName.length === 0) throw new Error("npm pack did not report an artifact");
  await rename(join(releaseRoot, packedName), releaseArtifact);
} finally {
  await rm(npmCache, { recursive: true, force: true });
}
const artifactBytes = await readFile(releaseArtifact);
const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
const extractionRoot = await mkdtemp(join(tmpdir(), "mcp-inspector-release-extract-"));
try {
  const extracted = spawnSync("tar", ["-xzf", releaseArtifact, "-C", extractionRoot], { cwd: root, encoding: "utf8" });
  if (extracted.status !== 0) throw new Error(`Could not inspect npm artifact:\n${extracted.stderr || extracted.stdout}`);
  for (const name of skillFiles) {
    const [source, packed] = await Promise.all([readFile(join(sourceSkillRoot, name)),
      readFile(join(extractionRoot, "package", "dist", "server", "skills", "standard", name))]);
    if (!source.equals(packed)) throw new Error(`Packed standard Skill differs from source: ${name}`);
  }
} finally { await rm(extractionRoot, { recursive: true, force: true }); }

console.log(JSON.stringify({
  initialJavaScriptGzipKiB: Number((javascriptBytes / 1024).toFixed(2)),
  initialCssGzipKiB: Number((cssBytes / 1024).toFixed(2)),
  ...packageResult,
  ...manifestResult,
  artifact: ".release/package.tgz",
  artifactSha256,
  standardSkillFileCount: skillFiles.length,
}, null, 2));
