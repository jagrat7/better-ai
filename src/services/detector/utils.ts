import pc from "picocolors"
import { detectNodeDeps } from "./javascript"
import { detectPythonDeps } from "./python"

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
