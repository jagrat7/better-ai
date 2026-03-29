import { log, multiselect, outro } from "@clack/prompts"
import pc from "picocolors"
import { detectService, type DetectInput, type DetectJson, type DetectResult } from "../detector/detect"
import { executeInstallations } from "./install-utils"
import { mcpAgents, skillAgents, defaultMcpAgents, defaultSkillAgents } from "../../registry/agents"
import { promptWithCancel } from "../utils"
import type { ServiceI } from "../service.inerface"
import { theme } from "../../components/theme"

export type InstallInput = DetectInput & {
  auto?: boolean
  agent?: string[]
  skills?: boolean
  mcp?: boolean
}

export type InstallResult = DetectResult & {
  selectedServers: DetectResult["servers"]
  selectedSkills: DetectResult["matched"]
  selectedMcpAgents: string[]
  selectedSkillAgents: string[]
  scope?: "all" | "skills" | "mcp"
}

export type InstallJson = DetectJson & {
  selectedMcpServers: DetectJson["mcpServers"]
  selectedSkills: DetectJson["skills"]
}

export class InstallService implements ServiceI<InstallInput, InstallResult, InstallJson> {
  async run({ auto, agent, skills, mcp, ...input }: InstallInput): Promise<InstallResult> {
    const detected = await detectService.run(input)
    const availableServers = skills && !mcp ? [] : detected.servers
    const availableSkills = mcp && !skills ? [] : detected.matched
    const scope = skills && !mcp ? "skills" : mcp && !skills ? "mcp" : "all"

    log.info(`Found ${pc.bold(detected.deps.size.toString())} dependencies in ${pc.dim(detected.project)}`)

    if (availableServers.length > 0) {
      log.success(pc.bold("MCP Servers"))
      for (const server of availableServers) {
        log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
      }
    }

    if (availableSkills.length > 0) {
      log.success(pc.bold("Skills"))
      for (const skill of availableSkills) {
        const status = skill.installed ? pc.green(" [installed]") : ""
        log.message(`  ${theme.bullet} ${skill.label} ${theme.hint(`\u2014 ${skill.resolvedSkills.length} skills`)}${status}`)
      }
    }

    if (availableServers.length === 0 && availableSkills.length === 0) {
      log.warn("No matching MCP servers or skills found for this project.")
      outro(pc.dim("Done"))
      return {
        ...detected,
        selectedServers: [],
        selectedSkills: [],
        selectedMcpAgents: [],
        selectedSkillAgents: [],
        scope,
      }
    }

    const resolvedAgents = agent
      ? await this.resolveAgents(agent, {
          hasServers: availableServers.length > 0,
          hasSkills: availableSkills.length > 0,
        })
      : null

    if (auto) {
      if (!resolvedAgents) {
        log.error("--auto requires --agent to be specified")
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

  private async resolveAgents(
    agents: string[],
    { hasServers, hasSkills }: { hasServers: boolean, hasSkills: boolean },
  ): Promise<{ mcp: string[], skill: string[] }> {
    const mcpValues = new Set(mcpAgents.map((a) => a.value))
    const skillValues = new Set(skillAgents.map((a) => a.value))

    const mcp: string[] = []
    const skill: string[] = []
    const unsupportedMcp: string[] = []
    const unsupportedSkill: string[] = []

    for (const agent of agents) {
      const inMcp = mcpValues.has(agent)
      const inSkill = skillValues.has(agent)

      if (inMcp) mcp.push(agent)
      if (inSkill) skill.push(agent)

      if (!inMcp && !inSkill) {
        log.warn(`Agent ${pc.bold(agent)} is not supported by MCP or skills CLI`)
      } else if (!inMcp) {
        unsupportedMcp.push(agent)
        log.warn(`Agent ${pc.bold(agent)} is not supported by MCP CLI (skills only)`)
      } else if (!inSkill) {
        unsupportedSkill.push(agent)
        log.warn(`Agent ${pc.bold(agent)} is not supported by skills CLI (MCP only)`)
      }
    }

    if (mcp.length === 0 && hasServers) {
      log.info("None of the specified agents support MCP — select MCP agents:")
      const picked = await promptWithCancel(() => multiselect({
        message: "Select agents to install MCP servers to",
        options: mcpAgents,
        initialValues: defaultMcpAgents,
        required: false,
      }))
      if (picked) mcp.push(...picked)
    }

    if (skill.length === 0 && hasSkills) {
      log.info("None of the specified agents support skills — select skill agents:")
      const picked = await promptWithCancel(() => multiselect({
        message: "Select agents to install skills to",
        options: skillAgents,
        initialValues: defaultSkillAgents,
        required: false,
      }))
      if (picked) skill.push(...picked)
    }

    return { mcp, skill }
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
        skills: skill.resolvedSkills,
      })),
    }
  }

  async command(result: InstallResult): Promise<void> {
    if (result.selectedServers.length === 0 && result.selectedSkills.length === 0) {
      const message = result.scope === "skills"
        ? "No skills selected."
        : result.scope === "mcp"
          ? "No MCP servers selected."
          : "No MCP servers or skills selected."
      log.warn(message)
      outro(pc.dim("Done"))
      return
    }

    log.info("Installing selected MCP servers and skills...")

    const execution = await executeInstallations({
      project: result.project,
      selectedSkills: result.selectedSkills,
      selectedServers: result.selectedServers,
      mcpAgents: result.selectedMcpAgents,
      skillAgents: result.selectedSkillAgents,
    })

    log.info(`Using ${pc.bold(execution.packageManager)} to run installer packages`)

    if (execution.mcp.installed.length > 0) {
      log.success(pc.bold("Installed MCP Servers"))
      for (const server of execution.mcp.installed) {
        log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
      }
    }

    if (execution.skills.installed.length > 0) {
      log.success(pc.bold("Installed Skills"))
      for (const skill of execution.skills.installed) {
        log.message(`  ${theme.bullet} ${skill.label} ${theme.hint(`— ${skill.resolvedSkills.length} skills`)}`)
      }
    }

    for (const failure of execution.mcp.failed) {
      log.warn(`Failed to install MCP server ${pc.bold(failure.item.name)}: ${failure.error}`)
    }

    for (const failure of execution.skills.failed) {
      log.warn(`Failed to install skills from ${pc.bold(failure.item.source)}: ${failure.error}`)
    }

    if (execution.mcp.installed.length === 0 && execution.skills.installed.length === 0) {
      throw new Error("Failed to install any selected MCP servers or skills")
    }

    outro(pc.dim("Done"))
  }

  private async promptForSelection(
    result: DetectResult,
    preResolvedAgents: { mcp: string[], skill: string[] } | null,
  ): Promise<Pick<InstallResult, "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"> | null> {
    const selectedServerKeys = result.servers.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select MCP servers to install",
          options: result.servers.map((server) => ({
            value: server.key,
            label: server.label,
            hint: server.name,
          })),
          initialValues: result.servers.map((server) => server.key),
          required: false,
        }))
      : []

    if (!selectedServerKeys) {
      return null
    }

    const selectedMcpAgents = preResolvedAgents?.mcp
      ?? (selectedServerKeys.length > 0
        ? await promptWithCancel(() => multiselect({
            message: "Select agents to install MCP servers to",
            options: mcpAgents,
            initialValues: defaultMcpAgents,
            required: false,
          }))
        : [])

    if (!selectedMcpAgents) {
      return null
    }

    const skillOptions = result.matched.flatMap((skill) =>
      skill.resolvedSkills.map((skillName) => ({
        value: `${skill.source}::${skillName}`,
        label: skillName,
        hint: skill.installed ? `${skill.label} [installed]` : skill.label,
        installed: skill.installed,
      }))
    )

    const selectedSkillKeys = skillOptions.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select skills to install",
          options: skillOptions,
          initialValues: skillOptions
            .filter((opt) => !opt.installed)
            .map((opt) => opt.value),
          required: false,
        }))
      : []

    if (!selectedSkillKeys) {
      return null
    }

    const selectedSkillAgents = preResolvedAgents?.skill
      ?? (selectedSkillKeys.length > 0
        ? await promptWithCancel(() => multiselect({
            message: "Select agents to install skills to",
            options: skillAgents,
            initialValues: defaultSkillAgents,
            required: false,
          }))
        : [])

    if (!selectedSkillAgents) {
      return null
    }

    const skillsBySource = new Map<string, string[]>()
    for (const key of selectedSkillKeys) {
      const separatorIndex = key.indexOf("::")
      if (separatorIndex === -1) continue
      const source = key.slice(0, separatorIndex)
      const skillName = key.slice(separatorIndex + 2)
      if (!skillsBySource.has(source)) {
        skillsBySource.set(source, [])
      }
      skillsBySource.get(source)!.push(skillName)
    }

    return {
      selectedServers: result.servers.filter((server) => selectedServerKeys.includes(server.key)),
      selectedSkills: result.matched
        .filter((skill) => skillsBySource.has(skill.source))
        .map((skill) => ({
          ...skill,
          resolvedSkills: skillsBySource.get(skill.source)!,
        })),
      selectedMcpAgents,
      selectedSkillAgents,
    }
  }
}

export const installService = new InstallService()

export async function install(input: InstallInput & { json?: boolean }) {
  const result = await installService.run({
    ...input,
    auto: input.auto ?? input.json ?? false,
  })

  if (input.json) {
    console.log(JSON.stringify(installService.json(result), null, 2))
    return
  }

  await installService.command(result)
}
