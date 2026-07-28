#!/usr/bin/env node
import { runCli } from './cli-main';

process.exitCode = await runCli({
  argv: process.argv.slice(2),
  writeOut: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  },
  isTty: process.stdout.isTTY === true,
});
