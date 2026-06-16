import { readFile } from "node:fs/promises"
import { join } from "path"
import { glob } from "tinyglobby"

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

function collectNodeDeps(pkg: PackageJson, deps: Set<string>) {
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

export async function detectNodeDeps(projectPath: string, deps: Set<string>): Promise<boolean> {
  const pkgPath = join(projectPath, "package.json")

  let pkg: PackageJson
  try {
    pkg = JSON.parse(await readFile(pkgPath, "utf-8"))
  } catch {
    return false
  }

  collectNodeDeps(pkg, deps)

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
        collectNodeDeps(workspacePkg, deps)
      } catch {}
    }
  }

  return true
}
