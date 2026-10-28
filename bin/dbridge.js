#!/usr/bin/env node

import { main } from "../src/cli.js";

main(process.argv.slice(2))
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
