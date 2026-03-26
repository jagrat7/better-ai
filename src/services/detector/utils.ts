import { readFile, access } from "node:fs/promises"
import { join } from "path"
import pc from "picocolors"
import { glob } from "tinyglobby"

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

function collectDeps(pkg: PackageJson, deps: Set<string>) {
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    deps.add(name)
  }
  for (const name of Object.keys(pkg.devDependencies ?? {})) {
    deps.add(name)
  }
}

function getWorkspacePatterns(pkg: PackageJson): string[] {
  if (Array.isArray(pkg.workspaces)) return pkg.workspaces
  if (pkg.workspaces?.packages) return pkg.workspaces.packages
  return []
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

  collectDeps(pkg, deps)

  const patterns = getWorkspacePatterns(pkg)
  if (patterns.length > 0) {
    const workspaceDirs = await glob(patterns, {
      cwd: projectPath,
      onlyDirectories: true,
      absolute: true,
    })

    for (const dir of workspaceDirs) {
      const workspacePkgPath = join(dir, "package.json")
      try {
        const workspacePkg: PackageJson = JSON.parse(await readFile(workspacePkgPath, "utf-8"))
        collectDeps(workspacePkg, deps)
      } catch {
        // workspace dir without package.json — skip
      }
    }
  }

  return deps
}
