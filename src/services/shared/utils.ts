import { cancel, isCancel, log, spinner } from "@clack/prompts"
import pc from "picocolors"
import { detectService } from "../detector/detect"
import type { DetectInput, DetectResult } from "../detector/types"

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
