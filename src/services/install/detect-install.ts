import { log, outro, spinner } from "@clack/prompts"
import pc from "picocolors"
import { detectService } from "../detect"
import { getSkillDetectionSource } from "../shared/skill-source"
import { runDetectionWithProgress } from "../shared/utils"
import { executeInstallations, reportInstallExecution } from "./utils"
import { InstallBase } from "./base"
import type { ServiceI } from "../service.interface"
import type { InstallInput, InstallJson, InstallResult } from "./types"

// Project-wide install: detect the stack, then install every matching MCP
// server + skill. Drives the `detect` CLI command.
export class DetectInstallService
  extends InstallBase
  implements ServiceI<InstallInput, InstallResult, InstallJson>
{
  async run({ auto, json, agent, skills, mcp, ...input }: InstallInput): Promise<InstallResult> {
    const detected = await runDetectionWithProgress(input, { quiet: json })
    const availableServers = skills && !mcp ? [] : detected.servers
    const availableSkills = mcp && !skills ? [] : detected.matched
    const scope = skills && !mcp ? "skills" : mcp && !skills ? "mcp" : "all"
    const quiet = json === true

    const totalSkillCount = availableSkills.reduce<number>(
      (sum, s) => sum + s.resolvedSkills.length,
      0,
    )
    const parts = [
      availableServers.length > 0 && `${pc.bold(availableServers.length.toString())} MCP servers`,
      totalSkillCount > 0 && `${pc.bold(totalSkillCount.toString())} skills`,
    ].filter(Boolean)

    if (!quiet && parts.length > 0) {
      log.info(`Found ${parts.join(" and ")} for ${pc.dim(detected.project)}`)
    }

    if (availableServers.length === 0 && availableSkills.length === 0) {
      if (!quiet) {
        log.warn("No matching MCP servers or skills found for this project.")
        outro(pc.dim("Done"))
      }
      return {
        ...detected,
        selectedServers: [],
        selectedSkills: [],
        selectedMcpAgents: [],
        selectedSkillAgents: [],
        scope,
      }
    }

    const resolvedAgents = await this.resolveInstallAgents({
      agent,
      project: detected.project,
      json,
      auto,
      hasServers: availableServers.length > 0,
      hasSkills: availableSkills.length > 0,
    })

    if (auto) {
      if (!resolvedAgents) {
        // Only reachable when agents are pinned (autoAgents: false) but the list
        // is empty and no --agent was given — auto mode can't prompt.
        log.error("No agents to install to. Pass --agent or pin agents via `bttrai config`.")
        outro(pc.dim("Done"))
        process.exit(1)
      }
      return {
        ...detected,
        selectedServers: availableServers,
        selectedSkills: availableSkills,
        selectedMcpAgents: resolvedAgents.mcp,
        selectedSkillAgents: resolvedAgents.skill,
        scope,
      }
    }

    const selection = await this.promptForSelection(
      {
        ...detected,
        servers: availableServers,
        matched: availableSkills,
      },
      resolvedAgents,
    )

    if (!selection) {
      return {
        ...detected,
        selectedServers: [],
        selectedSkills: [],
        selectedMcpAgents: [],
        selectedSkillAgents: [],
        scope,
      }
    }

    return {
      ...detected,
      ...selection,
      scope,
    }
  }

  json(result: InstallResult): InstallJson {
    const detected = detectService.json(result)

    return {
      ...detected,
      selectedMcpServers: result.selectedServers.map((server) => ({
        key: server.key,
        label: server.label,
        name: server.name,
      })),
      selectedSkills: result.selectedSkills.map((skill) => ({
        source: skill.source,
        label: skill.label,
        detectionSource: getSkillDetectionSource(skill),
        skills: skill.resolvedSkills,
        skillPaths: skill.resolvedSkillPaths,
      })),
    }
  }

  async command(result: InstallResult): Promise<void> {
    if (result.selectedServers.length === 0 && result.selectedSkills.length === 0) {
      const message =
        result.scope === "skills"
          ? "No skills selected."
          : result.scope === "mcp"
            ? "No MCP servers selected."
            : "No MCP servers or skills selected."
      log.warn(message)
      outro(pc.dim("Done"))
      return
    }

    const s = spinner()
    s.start("Installing selected MCP servers and skills...")

    const execution = await executeInstallations({
      project: result.project,
      selectedSkills: result.selectedSkills,
      selectedServers: result.selectedServers,
      mcpAgents: result.selectedMcpAgents,
      skillAgents: result.selectedSkillAgents,
    })

    s.stop("Installation complete")

    log.info(`Using ${pc.bold(execution.packageManager)} to run installer packages`)
    if (execution.usedFallback) {
      log.warn(
        `Preferred package manager ${pc.bold(execution.preferredPackageManager)} is unavailable, fell back to ${pc.bold(execution.packageManager)}`,
      )
    }

    reportInstallExecution(execution)

    if (execution.mcp.installed.length === 0 && execution.skills.installed.length === 0) {
      throw new Error("Failed to install any selected MCP servers or skills")
    }

    outro(pc.dim("Done"))
  }
}

export const detectInstallService = new DetectInstallService()
