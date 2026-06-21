import { z } from "zod"

// A single preset. `mcp`/`skills` reference registry entries (validated by the
// service). Preset *behavior* lives in plan 4 — extra keys are kept (catchall)
// so this stays forward-compatible with it.
export const presetSchema = z
  .object({
    mcp: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
  })
  .catchall(z.unknown())

export const configSchema = z.object({
  // Resolve agent targets at runtime; when true, `agents` is ignored.
  autoAgents: z.boolean().default(true),
  // User territory — bttrai reads this (when autoAgents is false) but never writes it.
  agents: z.array(z.string()).default([]),
  // Editor used by `bttrai config`. Takes precedence over $EDITOR (like git's
  // core.editor). When unset, falls back to $EDITOR then the OS text editor.
  editor: z.string().optional(),
  presets: z.record(z.string(), presetSchema).default({}),
})

export type Config = z.infer<typeof configSchema>
export type Preset = z.infer<typeof presetSchema>

// Empty config: auto mode, no pinned agents, no presets. Written lazily by
// `bttrai config` and the "reset to defaults" recovery path.
export const defaultConfig: Config = {
  autoAgents: true,
  agents: [],
  presets: {},
}

// Result of reading the config file off disk: missing, parsed, or malformed.
export type RawConfigFile =
  | { exists: false }
  | { exists: true; raw: unknown }
  | { exists: true; jsonError: string }

// Categories the config validator can flag, by validation phase. The type is
// derived from this single source instead of a duplicated literal union.
export const configErrorTypes = ["json", "schema", "agent", "preset"] as const
export type ConfigErrorType = (typeof configErrorTypes)[number]

export type ConfigError = {
  type: ConfigErrorType
  message: string
}

export type ConfigValidation = { ok: true; config: Config } | { ok: false; errors: ConfigError[] }

// `bttrai config` command I/O — the service triple (run/json/command).
export type ConfigInput = {
  json?: boolean
}

export type ConfigResult = {
  path: string
  created: boolean
  // Editor field read leniently from the file (even if the rest is malformed),
  // so the open step can honor it while the user is fixing a broken config.
  editor?: string
}

export type ConfigJson = {
  path: string
}
