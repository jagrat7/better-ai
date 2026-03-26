import { log, multiselect, outro } from "@clack/prompts"
import pc from "picocolors"
import { detectService, type DetectInput, type DetectJson, type DetectResult } from "../detector/detect"
import { executeInstallations, MCP_AGENTS, SKILL_AGENTS, DEFAULT_MCP_AGENTS, DEFAULT_SKILL_AGENTS } from "./install-utils"
import { promptWithCancel } from "../utils"
import type { ServiceI } from "../service.inerface"
import { theme } from "../../components/theme"

export type InstallInput = DetectInput & {
  auto?: boolean
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
  async run({ auto, skills, mcp, ...input }: InstallInput): Promise<InstallResult> {
    const detected = await detectService.run(input)
    const availableServers = skills && !mcp ? [] : detected.servers
    const availableSkills = mcp && !skills ? [] : detected.matched
    const scope = skills && !mcp ? "skills" : mcp && !skills ? "mcp" : "all"

    if (auto) {
      return {
        ...detected,
        selectedServers: availableServers,
        selectedSkills: availableSkills,
        selectedMcpAgents: DEFAULT_MCP_AGENTS,
        selectedSkillAgents: DEFAULT_SKILL_AGENTS,
        scope,
      }
    }

    const selection = await this.promptForSelection({
      ...detected,
      servers: availableServers,
      matched: availableSkills,
    })

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
        skills: skill.resolvedSkills,
      })),
    }
  }

  async command(result: InstallResult): Promise<void> {
    log.info(`Found ${pc.bold(result.deps.size.toString())} dependencies in ${pc.dim(result.project)}`)

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

  private async promptForSelection(result: DetectResult): Promise<Pick<InstallResult, "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"> | null> {
    const selectedServerKeys = result.servers.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select MCP servers to install",
          options: result.servers.map((server) => ({
            value: server.key,
            label: `${server.label} (${server.name})`,
            hint: server.name,
          })),
          initialValues: result.servers.map((server) => server.key),
          required: false,
        }))
      : []

    if (!selectedServerKeys) {
      return null
    }

    const selectedMcpAgents = selectedServerKeys.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select agents to install MCP servers to",
          options: MCP_AGENTS,
          initialValues: DEFAULT_MCP_AGENTS,
          required: false,
        }))
      : []

    if (!selectedMcpAgents) {
      return null
    }

    const skillOptions = result.matched.flatMap((skill) =>
      skill.resolvedSkills.map((skillName) => ({
        value: `${skill.source}::${skillName}`,
        label: skillName,
        hint: skill.label,
      }))
    )

    const selectedSkillKeys = skillOptions.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select skills to install",
          options: skillOptions,
          initialValues: skillOptions.map((opt) => opt.value),
          required: false,
        }))
      : []

    if (!selectedSkillKeys) {
      return null
    }

    const selectedSkillAgents = selectedSkillKeys.length > 0
      ? await promptWithCancel(() => multiselect({
          message: "Select agents to install skills to",
          options: SKILL_AGENTS,
          initialValues: DEFAULT_SKILL_AGENTS,
          required: false,
        }))
      : []

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
