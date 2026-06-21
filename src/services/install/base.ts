import { log, multiselect } from "@clack/prompts"
import pc from "picocolors"
import {
  getSkillDetectionSourceIcon,
  getSkillDetectionSourceKey,
} from "../shared/skill-source"
import { promptWithCancel } from "../shared/utils"
import { configService } from "../config"
import { agentOptionsWithHints, warnGlobalOnlyAgents } from "./utils"
import {
  defaultMcpAgents,
  defaultSkillAgents,
  mcpAgents,
  skillAgents,
  translateAgents,
} from "../../registry/agents"
import type { DetectResult } from "../detect/types"
import type { InstallResult } from "./types"

type SelectionResult = Pick<
  InstallResult,
  "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"
>

// Shared agent-resolution + interactive selection used by both the project
// (detect-driven) install and the package install. Both flows pick from the same
// matched servers/skills, so the prompts and `--agent` resolution live here.
export abstract class InstallBase {
  // Resolve install targets per the config plan precedence:
  //   --agent → (autoAgents ? auto-detect : config.agents) → null (prompt)
  // `--agent` uses the broad agent set (with missing-side prompts); config /
  // auto-detected agents are canonical and translated to MCP/skill targets.
  // bttrai never persists agents.
  protected async resolveInstallAgents({
    agent,
    project,
    json,
    hasServers,
    hasSkills,
  }: {
    agent?: string[]
    project: string
    json?: boolean
    hasServers: boolean
    hasSkills: boolean
  }): Promise<{ mcp: string[]; skill: string[] } | null> {
    if (agent) return this.resolveAgents(agent, { hasServers, hasSkills })

    const canonical = await configService.resolveConfiguredAgents(project, { json })
    if (!canonical || canonical.length === 0) return null
    // Canonical agents can translate to a one-sided result (e.g. vscode has no
    // skills target → `skill: []`). Fill the missing side so detected/config
    // agents don't silently skip installs the project still has content for.
    return this.fillMissingAgentSides(translateAgents(canonical), { hasServers, hasSkills })
  }

  // Prompt for agents on whichever side resolved empty but the project still has
  // content for. Shared by the `--agent` and canonical/auto-detect paths so both
  // behave the same when a resolved agent only covers one CLI.
  private async fillMissingAgentSides(
    { mcp, skill }: { mcp: string[]; skill: string[] },
    { hasServers, hasSkills }: { hasServers: boolean; hasSkills: boolean },
  ): Promise<{ mcp: string[]; skill: string[] }> {
    const resolvedMcp = [...mcp]
    const resolvedSkill = [...skill]

    if (resolvedMcp.length === 0 && hasServers) {
      log.info("None of the specified agents support MCP — select MCP agents:")
      const picked = await promptWithCancel(() =>
        multiselect({
          message: "Select agents to install MCP servers to",
          options: agentOptionsWithHints(mcpAgents),
          initialValues: defaultMcpAgents,
          required: false,
        }),
      )
      if (picked) {
        warnGlobalOnlyAgents(picked, mcpAgents)
        resolvedMcp.push(...picked)
      }
    }

    if (resolvedSkill.length === 0 && hasSkills) {
      log.info("None of the specified agents support skills — select skill agents:")
      const picked = await promptWithCancel(() =>
        multiselect({
          message: "Select agents to install skills to",
          options: agentOptionsWithHints(skillAgents),
          initialValues: defaultSkillAgents,
          required: false,
        }),
      )
      if (picked) resolvedSkill.push(...picked)
    }

    return { mcp: resolvedMcp, skill: resolvedSkill }
  }

  protected async resolveAgents(
    agents: string[],
    { hasServers, hasSkills }: { hasServers: boolean; hasSkills: boolean },
  ): Promise<{ mcp: string[]; skill: string[] }> {
    const mcpValues = new Set(mcpAgents.map((a) => a.value))
    const skillValues = new Set(skillAgents.map((a) => a.value))

    const mcp: string[] = []
    const skill: string[] = []

    for (const agent of agents) {
      const inMcp = mcpValues.has(agent)
      const inSkill = skillValues.has(agent)

      if (inMcp) mcp.push(agent)
      if (inSkill) skill.push(agent)

      if (!inMcp && !inSkill) {
        log.warn(`Agent ${pc.bold(agent)} is not supported by MCP or skills CLI`)
      } else if (!inMcp) {
        log.warn(`Agent ${pc.bold(agent)} is not supported by MCP CLI (skills only)`)
      } else if (!inSkill) {
        log.warn(`Agent ${pc.bold(agent)} is not supported by skills CLI (MCP only)`)
      }

      if (inMcp) {
        const entry = mcpAgents.find((a) => a.value === agent)
        if (entry?.globalOnly) {
          log.info(
            `${pc.bold(entry.label)} — MCP servers will be installed globally (no project-level config)`,
          )
        }
      }
    }

    return this.fillMissingAgentSides({ mcp, skill }, { hasServers, hasSkills })
  }

  async promptForSelection(
    result: DetectResult,
    preResolvedAgents: { mcp: string[]; skill: string[] } | null,
  ): Promise<SelectionResult | null> {
    const selectedServerKeys =
      result.servers.length > 0
        ? await promptWithCancel(() =>
            multiselect({
              message: "Select MCP servers to install",
              options: result.servers.map((server) => ({
                value: server.key,
                label: server.label,
                hint: server.name,
              })),
              initialValues: result.servers.map((server) => server.key),
              required: false,
            }),
          )
        : []

    if (!selectedServerKeys) {
      return null
    }

    const selectedMcpAgents =
      preResolvedAgents?.mcp ??
      (selectedServerKeys.length > 0
        ? await promptWithCancel(() =>
            multiselect({
              message: "Select agents to install MCP servers to",
              options: agentOptionsWithHints(mcpAgents),
              initialValues: defaultMcpAgents,
              required: false,
            }),
          )
        : [])

    if (!selectedMcpAgents) {
      return null
    }

    if (selectedMcpAgents.length > 0) {
      warnGlobalOnlyAgents(selectedMcpAgents, mcpAgents)
    }

    const skillOptions = result.matched.flatMap((skill) =>
      skill.resolvedSkills.map((skillName, index) => ({
        value: `${skill.source}::${skill.resolvedSkillPaths[index] ?? skillName}`,
        label: `${getSkillDetectionSourceIcon(skill)} ${skill.installed ? `${skillName} [installed]` : skillName}`,
        hint: skill.label,
        installed: skill.installed,
        source: skill.source,
        skillName,
        skillPath: skill.resolvedSkillPaths[index] ?? skillName,
      })),
    )

    const selectedSkillKeys =
      skillOptions.length > 0
        ? await promptWithCancel(() => {
            log.info(`Skill source key: ${getSkillDetectionSourceKey()}`)
            return multiselect({
              message: "Select skills to install",
              options: skillOptions,
              initialValues: skillOptions.filter((opt) => !opt.installed).map((opt) => opt.value),
              required: false,
            })
          })
        : []

    if (!selectedSkillKeys) {
      return null
    }

    const selectedSkillAgents =
      preResolvedAgents?.skill ??
      (selectedSkillKeys.length > 0
        ? await promptWithCancel(() =>
            multiselect({
              message: "Select agents to install skills to",
              options: skillAgents,
              initialValues: defaultSkillAgents,
              required: false,
            }),
          )
        : [])

    if (!selectedSkillAgents) {
      return null
    }

    const skillsBySource = new Map<string, { names: string[]; paths: string[] }>()
    const skillOptionsByValue = new Map(skillOptions.map((option) => [option.value, option]))

    for (const key of selectedSkillKeys) {
      const option = skillOptionsByValue.get(key)
      if (!option) continue
      const source = option.source
      if (!skillsBySource.has(source)) {
        skillsBySource.set(source, { names: [], paths: [] })
      }
      const selected = skillsBySource.get(source)!
      selected.names.push(option.skillName)
      selected.paths.push(option.skillPath)
    }

    return {
      selectedServers: result.servers.filter((server) => selectedServerKeys.includes(server.key)),
      selectedSkills: result.matched
        .filter((skill) => skillsBySource.has(skill.source))
        .map((skill) => ({
          ...skill,
          resolvedSkills: skillsBySource.get(skill.source)!.names,
          resolvedSkillPaths: skillsBySource.get(skill.source)!.paths,
        })),
      selectedMcpAgents,
      selectedSkillAgents,
    }
  }
}
