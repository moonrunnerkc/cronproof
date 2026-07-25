#!/usr/bin/env node
import { runCli } from './cli-main';

process.exitCode = await runCli({
  writeLine: (line) => {
    process.stdout.write(`${line}\n`);
  },
});
