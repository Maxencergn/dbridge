import assert from "node:assert/strict";
import test from "node:test";
import { sortDatabases } from "../src/config.js";
import { postgresUrl } from "../src/open.js";

test("l'adresse Postgres encode le compte et coupe SSL", () => {
  const url = postgresUrl("maxence@speeral.io", 5434, "speeral");
  assert.equal(
    url,
    "postgresql://maxence%40speeral.io:iam@127.0.0.1:5434/speeral?sslmode=disable",
  );
});

test("les bases système passent après les bases préférées", () => {
  assert.deepEqual(sortDatabases(["postgres", "nicky", "speeral", "prisma_shadow"], ["speeral"]), [
    "speeral",
    "nicky",
    "postgres",
    "prisma_shadow",
  ]);
});
