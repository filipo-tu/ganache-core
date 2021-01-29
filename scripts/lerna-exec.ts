import { spawnSync } from "child_process";
import os from "os";

const lernaRoot: string | undefined = process.env.LERNA_ROOT_PATH;
const spawnCwd =
  typeof lernaRoot === "string" && lernaRoot !== "" ? lernaRoot : process.cwd();

export function replaceSpecialStrings(args: string[]): string[] {
  return args.map(arg =>
    arg.replace(/_PACKAGEDIR_/g, process.cwd()).replace(/_ROOTDIR_/g, spawnCwd)
  );
}

export function LernaExec(command?: string, args?: string[]) {
  if (!command) {
    command = process.argv[2];
  }
  if (!args) {
    args = replaceSpecialStrings(process.argv.slice(3));
  }

  const env: NodeJS.ProcessEnv = {};
  const keys = Object.keys(process.env);
  const values = replaceSpecialStrings(Object.values(process.env) as string[]);
  for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    if (key.startsWith("TS_NODE_") && key.endsWith("_PT")) {
      // allow TS_NODE environment variables to not be processed
      // by ts-node running the lerna scripts, but to be processed
      // by the subsequent process
      key = key.substring(0, key.length - 3);
    }
    env[keys[i]] = values[i];
  }

  let result = spawnSync(command, args, {
    cwd: spawnCwd,
    stdio: ["inherit", "inherit", "inherit"],
    env
  });

  if (
    result.error &&
    result.error.message.includes("ENOENT") &&
    os.platform() === "win32"
  ) {
    // windows needs `npx.cmd` to be command for files in `node_modules/.bin`
    result = spawnSync("npx.cmd", [command, ...args], {
      cwd: spawnCwd,
      stdio: ["inherit", "inherit", "inherit"]
    });
  }

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status || undefined);
}
