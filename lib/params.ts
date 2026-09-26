import { parseArgs } from "@std/cli/parse-args";
import * as path from "@std/path";

export function params() {
  const {
    debug,
    "dry-run": dryRun,
    "out-dir": outDir,
    "asset-dir": assetDir,
    "script-dir": scriptDir,
    _: restParams,
  } = parseArgs(Deno.args, {
    string: [
      "out-dir",
      "asset-dir",
      "script-dir",
    ],
    boolean: [
      "debug",
      "dry-run",
    ],
    default: {
      "out-dir": path.resolve(Deno.cwd(), "out"),
      "asset-dir": path.resolve(Deno.cwd(), "assets"),
      "script-dir": path.resolve(Deno.cwd(), "scripts"),
    },
    alias: {
      "debug": "d",
      "out-dir": "o",
      "asset-dir": "a",
      "script-dir": "s",
      "dry-run": "n",
    },
  });

  return {
    debug,
    dryRun,
    outDir,
    assetDir,
    scriptDir,
    restParams,
  };
}
