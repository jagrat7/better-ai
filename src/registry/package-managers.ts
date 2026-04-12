type PackageManagerDefinition = {
  manager: string
  files: string[]
  command: string
  runner?: string
  getRunnerArgs?: (args: string[]) => string[]
}

const packageManagerDefinitions = [
  {
    manager: "deno",
    files: ["deno.lock", "deno.json", "deno.jsonc"],
    command: "deno",
    getRunnerArgs: (args) => {
      const [pkg, ...rest] = args
      return ["run", "--allow-all", `npm:${pkg}`, ...rest]
    },
  },
  { manager: "bun", files: ["bun.lock", "bun.lockb", "bunfig.toml"], command: "bun", runner: "bunx" },
  { manager: "pnpm", files: ["pnpm-lock.yaml"], command: "pnpm", getRunnerArgs: (args) => ["dlx", ...args] },
  { manager: "yarn", files: ["yarn.lock"], command: "yarn", getRunnerArgs: (args) => ["dlx", ...args] },
  { manager: "npm", files: ["package-lock.json"], command: "npx" },
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
