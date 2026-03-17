import { readFile, access } from "node:fs/promises"
import { join } from "path"
import pc from "picocolors"

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export async function detectDeps(projectPath: string): Promise<Set<string>> {
  const pkgPath = join(projectPath, "package.json")

  try {
    await access(pkgPath)
  } catch {
    throw new Error(
      `Could not find ${pc.bold("package.json")} in ${pc.dim(projectPath)} — are you in a project directory?`
    )
  }

  const pkg: PackageJson = JSON.parse(await readFile(pkgPath, "utf-8"))
  const deps = new Set<string>()

  for (const name of Object.keys(pkg.dependencies ?? {})) {
    deps.add(name)
  }
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    deps.add(name)
  }

  return deps
}
