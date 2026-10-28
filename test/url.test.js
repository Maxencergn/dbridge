import assert from "node:assert/strict";
import test from "node:test";
import { isLocalEnv, sortDatabases } from "../src/config.js";
import { visibleRange } from "../src/menu.js";
import { postgresUrl } from "../src/open.js";

test("the Postgres URL encodes the account and disables SSL", () => {
  const url = postgresUrl("maxence@speeral.io", 5434, "speeral");
  assert.equal(
    url,
    "postgresql://maxence%40speeral.io:iam@127.0.0.1:5434/speeral?sslmode=disable",
  );
});

test("a local URL keeps the configured password and host", () => {
  const url = postgresUrl("postgres", 5432, "speeral", { password: "p@ss", host: "localhost" });
  assert.equal(url, "postgresql://postgres:p%40ss@localhost:5432/speeral?sslmode=disable");
});

test("a local environment has a host and no GCP project", () => {
  assert.equal(isLocalEnv({ id: "local", host: "127.0.0.1" }), true);
  assert.equal(isLocalEnv({ id: "prod", project: "bisty", host: "127.0.0.1" }), false);
});

test("a long menu keeps the selection inside the visible window", () => {
  assert.deepEqual(visibleRange(10, 0, 4), { start: 0, count: 4 });
  assert.deepEqual(visibleRange(10, 9, 4), { start: 6, count: 4 });
  assert.deepEqual(visibleRange(3, 1, 10), { start: 0, count: 3 });
});

test("system databases sort after preferred databases", () => {
  assert.deepEqual(sortDatabases(["postgres", "nicky", "speeral", "prisma_shadow"], ["speeral"]), [
    "speeral",
    "nicky",
    "postgres",
    "prisma_shadow",
  ]);
});
