type PackageManagerDefinition = {
  manager: string
  files: string[]
  command: string
  runner?: string
  getRunnerArgs?: (args: string[]) => string[]
  // Builds the argv (after `command`) for a real package install. rawArgs are
  // forwarded verbatim — bttrai never reorders or interprets them.
  installArgs: (rawArgs: string[]) => string[]
}

// A token is a package (not a flag) when it does not start with "-".
const isFlag = (token: string) => token.startsWith("-")

const packageManagerDefinitions = [
  {
    manager: "deno",
    files: ["deno.lock", "deno.json", "deno.jsonc"],
    command: "deno",
    getRunnerArgs: (args) => {
      const [pkg, ...rest] = args
      return ["run", "--allow-all", `npm:${pkg}`, ...rest]
    },
    // deno resolves npm packages via the `npm:` specifier — prefix bare tokens
    // (leaving flags and already-prefixed specifiers untouched).
    installArgs: (rawArgs) => [
      "add",
      ...rawArgs.map((token) =>
        isFlag(token) || token.startsWith("npm:") ? token : `npm:${token}`,
      ),
    ],
  },
  {
    manager: "bun",
    files: ["bun.lock", "bun.lockb", "bunfig.toml"],
    command: "bun",
    runner: "bunx",
    installArgs: (rawArgs) => ["add", ...rawArgs],
  },
  {
    manager: "pnpm",
    files: ["pnpm-lock.yaml"],
    command: "pnpm",
    getRunnerArgs: (args) => ["dlx", ...args],
    installArgs: (rawArgs) => ["add", ...rawArgs],
  },
  {
    manager: "yarn",
    files: ["yarn.lock"],
    command: "yarn",
    getRunnerArgs: (args) => ["dlx", ...args],
    installArgs: (rawArgs) => ["add", ...rawArgs],
  },
  {
    manager: "npm",
    files: ["package-lock.json"],
    // `command` is the real binary used for installs; `runner` (npx) executes
    // one-off installer packages like skills@latest / add-mcp.
    command: "npm",
    runner: "npx",
    installArgs: (rawArgs) => ["install", ...rawArgs],
  },
] as const satisfies readonly PackageManagerDefinition[]

export type PackageManager = (typeof packageManagerDefinitions)[number]["manager"]

export type PackageManagerConfig = Omit<PackageManagerDefinition, "manager"> & {
  manager: PackageManager
}

export const packageManagers: PackageManagerConfig[] = packageManagerDefinitions.map((entry) => ({
  ...entry,
  files: [...entry.files],
}))

export function getPackageManagerConfig(packageManager: PackageManager) {
  const config = packageManagers.find((entry) => entry.manager === packageManager)
  if (!config) {
    throw new Error(`Unsupported package manager: ${packageManager}`)
  }
  return config
}
