import { log, outro } from "@clack/prompts"
import pc from "picocolors"
import { defaultConfig, type ConfigInput, type ConfigJson, type ConfigResult } from "./types"
import {
  autoDetectAgents,
  getConfigPath,
  openInEditor,
  readConfigFile,
  resolveConfig,
  writeConfig,
} from "./utils"

// The config module's only public surface. `run`/`json`/`command` drive the
// `bttrai config` command; `resolveConfiguredAgents` is what the install flow
// reads. Validation and config loading stay internal to ./utils.
export const configService = {
  // Resolve the path and lazily create an empty config. Reads the editor field
  // leniently so `command` can open even a malformed file.
  async run(_input: ConfigInput = {}): Promise<ConfigResult> {
    const path = getConfigPath()
    const file = await readConfigFile(path)

    const created = !file.exists
    if (created) await writeConfig(defaultConfig, path)

    // Honor the editor field even if the rest of the file is malformed (the user
    // may be opening it to fix exactly that).
    const raw = "raw" in file ? (file.raw as { editor?: unknown }) : undefined
    const editor = typeof raw?.editor === "string" ? raw.editor : undefined

    return { path, created, editor }
  },

  json(result: ConfigResult): ConfigJson {
    return { path: result.path }
  },

  // Interactive half of `bttrai config`: open the file in an editor (TTY only).
  // JSON / non-TTY callers print `json(result).path` instead.
  async command(result: ConfigResult): Promise<void> {
    try {
      const opened = await openInEditor(result.path, result.editor)
      if (opened) {
        log.info(`Opened config ${pc.dim(result.path)}`)
      } else {
        log.info('Set $EDITOR (or "editor" in config) to open it automatically. Config path:')
        console.log(result.path)
      }
    } catch (error) {
      log.warn(`Could not open an editor: ${error instanceof Error ? error.message : String(error)}`)
      console.log(result.path)
    }
    outro(pc.dim("Done"))
  },

  // Resolve canonical agents for the run when `--agent` was not passed:
  //   autoAgents ? auto-detect : config.agents
  // Returns null to fall back to prompting (autoAgents off + no pinned agents).
  async resolveConfiguredAgents(project: string, { json }: ConfigInput = {}): Promise<string[] | null> {
    const config = await resolveConfig({ json })
    if (config.autoAgents) return autoDetectAgents(project)
    return config.agents.length > 0 ? config.agents : null
  },
}
