import { access, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { cancel, isCancel, log, spinner } from "@clack/prompts"
import pc from "picocolors"
import { detectService } from "../detect"
import type { DetectInput, DetectResult } from "../detect/types"
import type { SkillsLockFile } from "../matcher/types"

/** Reads the project's skills-lock.json to know which skills are already installed. */
export async function readSkillsLock(project: string): Promise<Set<string>> {
  try {
    const raw = await readFile(join(project, "skills-lock.json"), "utf-8")
    const lock: SkillsLockFile = JSON.parse(raw)
    return new Set(Object.keys(lock.skills ?? {}))
  } catch {
    return new Set()
  }
}

// Cheap existence check — true if `path` exists, false otherwise. Shared by the
// config (agent-marker) and install (package-manager) detection loops.
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Fail fast with a clear message when the target project directory is missing
// or isn't a directory, instead of letting the package manager / installer
// surface a raw ENOENT from an invalid execa `cwd`.
export async function assertProjectExists(project: string): Promise<void> {
  try {
    const stats = await stat(project)
    if (!stats.isDirectory()) {
      throw new Error(`Project path is not a directory: ${project}`)
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`Project directory not found: ${project}`)
    }
    throw error
  }
}

// Shared UX wrapper: runs detection while showing spinners + logs. Used by both
// the `detect` command and `install` so they share the same progress output.
// quiet=true skips all logs (used in --json mode).
export async function runDetectionWithProgress(
  input: DetectInput,
  { quiet = false }: { quiet?: boolean } = {},
): Promise<DetectResult> {
  const s = !quiet ? spinner() : null
  // Track whether a fallback spinner was actually started so we know whether
  // to stop it after detection completes.
  let fallbackStarted = false
  const result = await detectService.run({
    ...input,
    // Fires once, right after deps are detected (before GitHub fetches).
    onDeps: (deps) => {
      if (quiet) return
      log.info(`Found ${pc.bold(deps.size.toString())} dependencies in ${pc.dim(input.project)}`)
    },
    // Fires twice: once when GitHub fetches start, once when fallback starts.
    onProgress: (progress) => {
      if (!s) return
      if (progress.phase === "github") {
        // Skip spinner if nothing matched the registry — nothing to fetch.
        if (progress.total === 0) return
        s.start(`Fetching skills from GitHub... (${progress.total} matches)`)
        return
      }
      // The detect flow never opts into dynamic discovery, so the stage-1
      // discover phases never reach here — ignore them defensively.
      if (progress.phase !== "fallback") return
      // phase === "fallback": GitHub fetches finished, transition the spinner.
      s.stop("Fetched skills from GitHub")
      // Skip fallback step entirely when every source returned GitHub skills.
      if (progress.total === 0) return
      s.start(`Searching remaining deps in fallback list... (${progress.total} remaining)`)
      fallbackStarted = true
    },
  })
  // Only stop the fallback spinner if we actually started one.
  if (fallbackStarted) {
    s?.stop("Fallback search complete")
  }
  return result
}

export async function promptWithCancel<T>(prompt: () => Promise<T | symbol>): Promise<T | null> {
  const selection = await prompt()

  if (isCancel(selection)) {
    cancel("Selection cancelled")
    return null
  }

  return selection
}
