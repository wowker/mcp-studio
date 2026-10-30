import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Makefile graceful shutdown", () => {
  it("waits longer than five seconds for the verified app process to exit cleanly", () => {
    const root = mkdtempSync(join(tmpdir(), "inspector-make-stop-"));
    const runDir = join(root, "run");
    const buildEntry = join(root, "main.js");
    const appEntry = join(root, "slow-close.mjs");
    const makefile = join(root, "Makefile");
    writeFileSync(buildEntry, "");
    writeFileSync(appEntry, `let closing = false;
process.on("SIGTERM", () => {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(0), 5_500);
});
setInterval(() => undefined, 1_000);
`);
    writeFileSync(makefile, readFileSync(resolve("Makefile"), "utf8").replaceAll("dist/server/main.js", buildEntry));
    const variables = [`NODE=${process.execPath}`, `RUN_DIR=${runDir}`, `APP_ENTRY=${appEntry}`];
    const options = { cwd: resolve("."), encoding: "utf8" as const, timeout: 15_000 };
    let pid: number | undefined;

    try {
      const started = spawnSync("make", ["-f", makefile, "start", ...variables], options);
      expect(started.status, `${started.stdout}${started.stderr}`).toBe(0);
      pid = Number(readFileSync(join(runDir, "mcp-inspector.pid"), "utf8").trim());

      const stopped = spawnSync("make", ["-f", makefile, "stop", ...variables], options);

      expect(stopped.status, `${stopped.stdout}${stopped.stderr}`).toBe(0);
      expect(stopped.stdout).toContain("MCP-Testpilot stopped");
      expect(existsSync(join(runDir, "mcp-inspector.pid"))).toBe(false);
    } finally {
      if (pid !== undefined) {
        const command = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).stdout;
        if (command.includes(appEntry)) process.kill(pid, "SIGKILL");
      }
      rmSync(root, { recursive: true, force: true });
    }
  }, 20_000);
});
