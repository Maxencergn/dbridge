import { sortDatabases } from "./config.js";
import { commandExists, portOpen, run } from "./process.js";

export async function listLocalDatabases(env, preferred = []) {
  const host = env.host;
  const port = Number(env.port);
  if (!(await portOpen(port, host))) {
    throw new Error(`Postgres is not reachable at ${host}:${port}.`);
  }
  const psql = commandExists("psql");
  if (!psql) throw new Error("psql was not found. Install the PostgreSQL client to list local databases.");
  const result = await run(
    psql,
    [
      "-w",
      "-h",
      host,
      "-p",
      String(port),
      "-U",
      env.user,
      "-d",
      "postgres",
      "-At",
      "-c",
      "SELECT datname FROM pg_database WHERE datistemplate = false",
    ],
    {
      timeout: 10_000,
      env: { ...process.env, PGPASSWORD: env.password ?? "" },
    },
  );
  if (result.code !== 0) {
    const message = result.stderr.trim() || result.stdout.trim() || "Could not list local databases.";
    throw new Error(message);
  }
  const names = result.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  return sortDatabases(names, preferred);
}
