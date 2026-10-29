// Applies server/migrations/*.sql in order and records them in schema_migrations.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./db";

function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return resolve(process.env.MIGRATIONS_DIR);
  // Works both from src/ (tsx) and dist/ (bundled build).
  return join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

export async function migrate(log: (message: string) => void = console.log): Promise<void> {
  const client = await pool.connect();
  try {
    // Serialize concurrent starts (several containers booting at once).
    await client.query("select pg_advisory_lock(7212412212)");
    await client.query(`
      create table if not exists schema_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )`);
    const applied = new Set(
      (await client.query<{ name: string }>("select name from schema_migrations")).rows.map((row) => row.name),
    );
    const dir = migrationsDir();
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        log(`migration applied: ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(7212412212)").catch(() => undefined);
    client.release();
  }
}

const isEntryPoint = process.argv[1] && /migrate\.(ts|js)$/.test(process.argv[1]);
if (isEntryPoint) {
  migrate()
    .then(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
