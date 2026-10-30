import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/server/main.ts",
    "workflows/script-worker": "src/server/workflows/script-worker.ts",
    "projects/storage-reclaim-worker": "src/server/projects/storage-reclaim-worker.ts",
  },
  format: ["esm"],
  target: "node24",
  outDir: "dist/server",
  clean: true,
  splitting: false,
});
