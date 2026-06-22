import type { McpServerEntry, SkillEntry } from "../../registry/types"
import type { McpServerJson, SkillDetectionSource, SkillJson } from "../shared/types"

export type ResolvedSkillEntry = Omit<SkillEntry, "conditionalSkills"> & {
  resolvedSkills: string[]
  resolvedSkillPaths: string[]
  detectionSource: SkillDetectionSource
  installed: boolean
}

export type SkillsLockFile = {
  version: number
  skills: Record<
    string,
    {
      source: string
      sourceType: string
      computedHash: string
    }
  >
}

export type MatcherInput = {
  deps: Set<string>
  installedSkills?: Set<string>
  onProgress?: (progress: MatcherProgress) => void
  // Opt-in live discovery: deps unmatched by the static registry get resolved
  // via npm repo metadata → GitHub repo search. Only the package-targeted
  // install sets this — the detect flow scans every project dep, far too many
  // to probe without tripping GitHub's unauthenticated rate limit.
  discover?: boolean
  // Project root. When set, stage 0 scans node_modules/<dep>/skills for
  // tarball-shipped SKILL.md files (the TanStack Intent convention) — a free,
  // offline, version-pinned source ahead of any GitHub fetch.
  project?: string
}

export type MatcherProgress =
  // Stage 0 local node_modules scan (any flow that knows the project root).
  | { phase: "local"; total: number }
  // Stage 1 live discovery (package-install only). "discover" opens the spinner
  // with the dep count; "discover-step" streams atomic sub-actions (npm lookup,
  // GitHub repo scan, GitHub search) as each tier runs.
  | { phase: "discover"; total: number }
  | { phase: "discover-step"; message: string }
  // Stage 2 GitHub fetch of registry-pinned repos / stage 3 hand-maintained fallback.
  | { phase: "github"; total: number }
  | { phase: "fallback"; total: number }

export type MatcherResult = {
  servers: McpServerEntry[]
  skills: ResolvedSkillEntry[]
}

export type MatcherJson = {
  mcpServers: McpServerJson[]
  skills: SkillJson[]
}
