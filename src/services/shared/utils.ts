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
  // One spinner advanced through stages via .message(), started lazily on the
  // first stage with work so a project with zero matches shows no spinner.
  let started = false
  const show = (message: string) => {
    if (!s) return
    if (started) {
      s.message(message)
      return
    }
    s.start(message)
    started = true
  }
  const result = await detectService.run({
    ...input,
    // Fires once, right after deps are detected (before any fetch).
    onDeps: (deps) => {
      if (quiet) return
      log.info(`Found ${pc.bold(deps.size.toString())} dependencies in ${pc.dim(input.project)}`)
    },
    // Fires per matcher stage. The detect flow opts into stage 0 (local
    // node_modules); a single-dep `detect --dep` also opts into the discover
    // stages, so those can reach here too.
    onProgress: (progress) => {
      switch (progress.phase) {
        case "local":
          if (progress.total > 0) show("Scanning node_modules for skills...")
          break
        case "discover":
          if (progress.total > 0) show("Discovering skills...")
          break
        case "discover-step":
          show(progress.message)
          break
        case "github":
          if (progress.total > 0) show(`Fetching skills from GitHub... (${progress.total} matches)`)
          break
        case "fallback":
          if (progress.total > 0) {
            show(`Searching remaining deps in fallback list... (${progress.total} remaining)`)
          }
          break
      }
    },
  })
  if (started) s?.stop("Skill detection complete")
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
