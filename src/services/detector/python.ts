import { readFile } from "node:fs/promises"
import { join } from "path"
import { parse as parseTOML } from "smol-toml"

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

export async function detectPythonDeps(projectPath: string, deps: Set<string>): Promise<boolean> {
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

  if (project) {
    addPep508Deps(project.dependencies as string[] | undefined, deps)

    const optDeps = project["optional-dependencies"] as Record<string, string[]> | undefined
    for (const group of Object.values(optDeps ?? {})) {
      addPep508Deps(group, deps)
    }
  }

  const uv = tool?.uv as Record<string, unknown> | undefined
  if (uv) {
    addPep508Deps(uv["dev-dependencies"] as string[] | undefined, deps)
  }

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
