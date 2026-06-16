import { log, multiselect, outro, spinner } from "@clack/prompts"
import pc from "picocolors"
import { detectService } from "../detect"
import {
  getSkillDetectionSource,
  getSkillDetectionSourceIcon,
  getSkillDetectionSourceKey,
} from "../shared/skill-source"
import { runDetectionWithProgress, promptWithCancel } from "../shared/utils"
import {
  agentOptionsWithHints,
  executeInstallations,
  extractPackageNames,
  reportInstallExecution,
  resolvePackageManager,
  runInstallCommand,
  warnGlobalOnlyAgents,
} from "./utils"
import { mcpAgents, skillAgents, defaultMcpAgents, defaultSkillAgents } from "../../registry/agents"
import { matcherService } from "../matcher"
import type { ServiceI } from "../service.interface"
import type { DetectResult } from "../detect/types"
import type { InstallInput, InstallJson, InstallResult, PackageInstallInput } from "./types"

export class InstallService implements ServiceI<InstallInput, InstallResult, InstallJson> {
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
    { hasServers, hasSkills }: { hasServers: boolean; hasSkills: boolean },
  ): Promise<{ mcp: string[]; skill: string[] }> {
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

      if (inMcp) {
        const entry = mcpAgents.find((a) => a.value === agent)
        if (entry?.globalOnly) {
          log.info(
            `${pc.bold(entry.label)} — MCP servers will be installed globally (no project-level config)`,
          )
        }
      }
    }

    if (mcp.length === 0 && hasServers) {
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
        mcp.push(...picked)
      }
    }

    if (skill.length === 0 && hasSkills) {
      log.info("None of the specified agents support skills — select skill agents:")
      const picked = await promptWithCancel(() =>
        multiselect({
          message: "Select agents to install skills to",
          options: agentOptionsWithHints(skillAgents),
          initialValues: defaultSkillAgents,
          required: false,
        }),
      )
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

  // Install flow for `better-ai install <pkg>`: run the real package install,
  // then resolve and install any matching extras for the named packages. Honors
  // the same scope/agent flags as the detect flow (--mcp/--skills/--agent/--auto).
  async installForPackages({
    project,
    rawArgs,
    mcp,
    skills,
    agent,
    auto,
    json,
  }: PackageInstallInput): Promise<void> {
    const { packageManager, preferredPackageManager, usedFallback } =
      await resolvePackageManager(project)

    // Run the real package install, args forwarded verbatim.
    log.info(`Installing with ${pc.bold(packageManager)}: ${pc.dim(rawArgs.join(" "))}`)
    let installFailed = false
    try {
      await runInstallCommand(project, packageManager, rawArgs)
    } catch (error) {
      installFailed = true
      const message = error instanceof Error ? error.message : String(error)
      log.error(`Package install failed: ${message}`)
    }

    if (usedFallback) {
      log.warn(
        `Preferred package manager ${pc.bold(preferredPackageManager)} is unavailable, fell back to ${pc.bold(packageManager)}`,
      )
    }

    // Read package names out of the raw args to resolve their extras.
    const deps = new Set(extractPackageNames(rawArgs))
    if (deps.size === 0) {
      if (!installFailed) outro(pc.dim("Done"))
      return
    }

    // Match extras, excluding universal (wildcard) entries so a package-targeted
    // install stays focused on the named packages.
    const matches = await matcherService.run({ deps })
    const matchedServers = matches.servers.filter((server) => !server.when.deps.includes("*"))
    const matchedSkills = matches.skills.filter((skill) => !skill.when.deps.includes("*"))

    // Apply --mcp / --skills scope, same semantics as the detect flow.
    const availableServers = skills && !mcp ? [] : matchedServers
    const availableSkills = mcp && !skills ? [] : matchedSkills

    if (availableServers.length === 0 && availableSkills.length === 0) {
      log.info(`No extras found for ${pc.bold([...deps].join(", "))}`)
      outro(pc.dim("Done"))
      return
    }

    const resolvedAgents = agent
      ? await this.resolveAgents(agent, {
          hasServers: availableServers.length > 0,
          hasSkills: availableSkills.length > 0,
        })
      : null

    // Pick extras + agents: --auto installs everything (requires --agent), JSON /
    // non-TTY falls back to all matches with resolved-or-default agents, otherwise
    // prompt interactively (reusing the detect flow's prompts).
    let selection: Pick<
      InstallResult,
      "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"
    > | null
    if (auto) {
      if (!resolvedAgents) {
        log.error("--auto requires --agent to be specified")
        outro(pc.dim("Done"))
        process.exit(1)
      }
      selection = {
        selectedServers: availableServers,
        selectedSkills: availableSkills,
        selectedMcpAgents: resolvedAgents.mcp,
        selectedSkillAgents: resolvedAgents.skill,
      }
    } else if (json || !process.stdout.isTTY) {
      selection = {
        selectedServers: availableServers,
        selectedSkills: availableSkills,
        selectedMcpAgents: resolvedAgents?.mcp ?? defaultMcpAgents,
        selectedSkillAgents: resolvedAgents?.skill ?? defaultSkillAgents,
      }
    } else {
      selection = await this.promptForSelection(
        { project, deps, servers: availableServers, matched: availableSkills },
        resolvedAgents,
      )
    }

    if (!selection) {
      outro(pc.dim("Done"))
      return
    }

    if (selection.selectedServers.length === 0 && selection.selectedSkills.length === 0) {
      log.warn("No extras selected.")
      outro(pc.dim("Done"))
      return
    }

    const s = spinner()
    s.start("Installing matched MCP servers and skills...")
    const execution = await executeInstallations({
      project,
      selectedSkills: selection.selectedSkills,
      selectedServers: selection.selectedServers,
      mcpAgents: selection.selectedMcpAgents,
      skillAgents: selection.selectedSkillAgents,
    })
    s.stop("Extras installed")

    reportInstallExecution(execution)
    outro(pc.dim("Done"))
  }

  async promptForSelection(
    result: DetectResult,
    preResolvedAgents: { mcp: string[]; skill: string[] } | null,
  ): Promise<Pick<
    InstallResult,
    "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"
  > | null> {
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

export const installService = new InstallService()

export async function install(input: InstallInput & { json?: boolean }) {
  const result = await installService.run({
    ...input,
    json: input.json,
    auto: input.auto ?? input.json ?? false,
  })

  if (input.json) {
    console.log(JSON.stringify(installService.json(result), null, 2))
    return
  }

  await installService.command(result)
}
