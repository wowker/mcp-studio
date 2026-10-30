import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const staticDirectories = ["projects/migrations", "registry/migrations", "skills/standard"];

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
    else throw new Error(`Unsupported static asset: ${relative}`);
  }
  return files.sort();
}

for (const directory of staticDirectories) {
  const source = fileURLToPath(new URL(`../src/server/${directory}`, import.meta.url));
  const destination = fileURLToPath(new URL(`../dist/server/${directory}`, import.meta.url));
  try {
    await stat(source);
    await mkdir(destination, { recursive: true });
    await cp(source, destination, { recursive: true });
    const sourceEntries = await listFiles(source);
    const destinationEntries = await listFiles(destination);
    if (JSON.stringify(sourceEntries) !== JSON.stringify(destinationEntries)) {
      throw new Error(`Bundled ${directory} files do not match source assets`);
    }
    for (const name of sourceEntries) {
      const [sourceBytes, destinationBytes] = await Promise.all([
        readFile(join(source, name)),
        readFile(join(destination, name)),
      ]);
      if (!sourceBytes.equals(destinationBytes)) {
        throw new Error(`Bundled static asset differs from source: ${directory}/${name}`);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
