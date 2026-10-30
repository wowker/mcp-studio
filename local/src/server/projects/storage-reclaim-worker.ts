import Database from "better-sqlite3";
import { statSync } from "node:fs";

process.once("message", (input: { databasePath: string }) => {
  let db: Database.Database | undefined;
  try {
    db = new Database(input.databasePath, { fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    const checkpoint = db.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
    if (checkpoint.some((item) => item.busy !== 0)) throw new Error("CHECKPOINT_BUSY");
    db.exec("VACUUM");
    const final = db.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
    if (final.some((item) => item.busy !== 0)) throw new Error("CHECKPOINT_BUSY");
    db.close(); db = undefined;
    const size = (path: string) => { try { return statSync(path).size; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; } };
    process.send?.({ ok: true, afterBytes: size(input.databasePath) + size(`${input.databasePath}-wal`) });
  } catch { process.send?.({ ok: false }); }
  finally { db?.close(); process.disconnect(); }
});
