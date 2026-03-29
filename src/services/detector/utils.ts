import { readFile } from "node:fs/promises"
import { join } from "path"
import pc from "picocolors"
import { glob } from "tinyglobby"
import { parse as parseTOML } from "smol-toml"

// -- Node / package.json --

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

async function detectNodeDeps(projectPath: string, deps: Set<string>): Promise<boolean> {
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
      } catch {
        // workspace dir without package.json — skip
      }
    }
  }

  return true
}

// -- Python / pyproject.toml --

const PEP508_SPLIT = /[>=<~;\[\s]/

function normalizePyName(name: string): string {
  return name.trim().toLowerCase()
}

function addPep508Deps(specs: string[] | undefined, deps: Set<string>) {
  for (const dep of specs ?? []) {
    const name = normalizePyName(dep.split(PEP508_SPLIT)[0] ?? "")
    if (name) deps.add(name)
  }
}

function addRecordDeps(record: Record<string, unknown> | undefined, deps: Set<string>) {
  for (const name of Object.keys(record ?? {})) {
    if (name !== "python") deps.add(normalizePyName(name))
  }
}

async function detectPythonDeps(projectPath: string, deps: Set<string>): Promise<boolean> {
  const tomlPath = join(projectPath, "pyproject.toml")

  let raw: string
  try {
    raw = await readFile(tomlPath, "utf-8")
  } catch {
    return false
  }

  const toml = parseTOML(raw) as Record<string, unknown>
  const project = toml.project as Record<string, unknown> | undefined
  const tool = toml.tool as Record<string, unknown> | undefined

  // PEP 621: [project] dependencies
  if (project) {
    addPep508Deps(project.dependencies as string[] | undefined, deps)

    // [project.optional-dependencies]
    const optDeps = project["optional-dependencies"] as Record<string, string[]> | undefined
    for (const group of Object.values(optDeps ?? {})) {
      addPep508Deps(group, deps)
    }
  }

  // uv: [tool.uv.dev-dependencies]
  const uv = tool?.uv as Record<string, unknown> | undefined
  if (uv) {
    addPep508Deps(uv["dev-dependencies"] as string[] | undefined, deps)
  }

  // Poetry: [tool.poetry.dependencies] and [tool.poetry.group.*.dependencies]
  const poetry = tool?.poetry as Record<string, unknown> | undefined
  if (poetry) {
    addRecordDeps(poetry.dependencies as Record<string, unknown> | undefined, deps)

    const groups = poetry.group as Record<string, Record<string, unknown>> | undefined
    for (const group of Object.values(groups ?? {})) {
      addRecordDeps(group.dependencies as Record<string, unknown> | undefined, deps)
    }
  }

  return true
}

// -- Public API --

export async function detectDeps(projectPath: string): Promise<Set<string>> {
  const deps = new Set<string>()

  const [foundNode, foundPython] = await Promise.all([
    detectNodeDeps(projectPath, deps),
    detectPythonDeps(projectPath, deps),
  ])

  if (!foundNode && !foundPython) {
    throw new Error(
      `Could not find ${pc.bold("package.json")} or ${pc.bold("pyproject.toml")} in ${pc.dim(projectPath)} — are you in a project directory?`
    )
  }

  return deps
}
