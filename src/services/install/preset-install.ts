import { configService } from "../config"
import { presetToExtras } from "./utils"
import { InstallBase } from "./base"
import type { ServiceI } from "../service.interface"
import type { DetectResult } from "../detect/types"
import type { InstallJson, InstallResult, PresetInstallInput } from "./types"

// Preset install: install a named config preset's MCP servers + skills with no
// stack detection. Drives the `preset` CLI command. Only the source of the
// extras (the preset) differs from `detect`; selection/agent/install logic is
// shared via InstallBase.
export class PresetInstallService
  extends InstallBase
  implements ServiceI<PresetInstallInput, InstallResult, InstallJson>
{
  async run({
    auto,
    json,
    agent,
    skills,
    mcp,
    preset,
    project,
  }: PresetInstallInput): Promise<InstallResult> {
    const { servers, skills: matched } = presetToExtras(
      await configService.resolvePreset(preset, { json }),
    )
    const detected: DetectResult = { project, deps: new Set(), servers, matched }
    return this.selectFromResult(detected, { auto, json, agent, skills, mcp })
  }
}

export const presetInstallService = new PresetInstallService()
