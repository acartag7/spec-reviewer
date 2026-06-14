import { runCli } from "./cli.ts";

runCli().then((code) => {
  if (code !== 0) process.exitCode = code;
});
