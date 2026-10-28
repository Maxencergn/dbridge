import assert from "node:assert/strict";
import test from "node:test";
import { sortDatabases } from "../src/config.js";
import { postgresUrl } from "../src/open.js";

test("the Postgres URL encodes the account and disables SSL", () => {
  const url = postgresUrl("maxence@speeral.io", 5434, "speeral");
  assert.equal(
    url,
    "postgresql://maxence%40speeral.io:iam@127.0.0.1:5434/speeral?sslmode=disable",
  );
});

test("system databases sort after preferred databases", () => {
  assert.deepEqual(sortDatabases(["postgres", "nicky", "speeral", "prisma_shadow"], ["speeral"]), [
    "speeral",
    "nicky",
    "postgres",
    "prisma_shadow",
  ]);
});
