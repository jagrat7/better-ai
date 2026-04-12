import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const helpersDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(helpersDir, "..", "..")

export function runCli(args: string[]) {
  const result = spawnSync(process.execPath, ["run", "src/cli.ts", ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
  })

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}
