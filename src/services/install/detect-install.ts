import { runDetectionWithProgress } from "../shared/utils"
import { InstallBase } from "./base"
import type { ServiceI } from "../service.interface"
import type { InstallInput, InstallJson, InstallResult } from "./types"

// Project-wide install: detect the stack, then install every matching MCP
// server + skill. Drives the `detect` CLI command. Selection/agent/install
// logic is shared via InstallBase — this only owns stack detection.
export class DetectInstallService
  extends InstallBase
  implements ServiceI<InstallInput, InstallResult, InstallJson>
{
  async run({ auto, json, agent, skills, mcp, ...input }: InstallInput): Promise<InstallResult> {
    const detected = await runDetectionWithProgress(input, { quiet: json })
    return this.selectFromResult(detected, { auto, json, agent, skills, mcp })
  }
}

export const detectInstallService = new DetectInstallService()
