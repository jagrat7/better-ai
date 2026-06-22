import { log, outro, spinner } from "@clack/prompts"
import pc from "picocolors"
import { matcherService } from "../matcher"
import {
  executeInstallations,
  extractPackageNames,
  reportInstallExecution,
  resolvePackageManager,
  runInstallCommand,
} from "./utils"
import { InstallBase } from "./base"
import type { InstallResult, PackageInstallInput } from "./types"

type SelectionResult = Pick<
  InstallResult,
  "selectedServers" | "selectedSkills" | "selectedMcpAgents" | "selectedSkillAgents"
>

// Package install: run the real package install (e.g. `bun add ai`), then
// resolve and install any extras matching the named packages. Drives the
// `install <pkg>` CLI command. Honors the same scope/agent flags as the project
// install (--mcp/--skills/--agent/--auto).
export class PackageInstallService extends InstallBase {
  async run({ project, rawArgs, mcp, skills, agent, auto, json }: PackageInstallInput): Promise<void> {
    const { packageManager, preferredPackageManager, usedFallback } =
      await resolvePackageManager(project)

    // Run the real package install, args forwarded verbatim.
    log.info(`Installing with ${pc.bold(packageManager)}: ${pc.dim(rawArgs.join(" "))}`)
    try {
      await runInstallCommand(project, packageManager, rawArgs)
    } catch (error) {
      // The package install failed — the packages aren't present, so resolving
      // and installing their extras would be premature. Abort here.
      const message = error instanceof Error ? error.message : String(error)
      log.error(`Package install failed: ${message}`)
      outro(pc.dim("Aborted"))
      process.exit(1)
    }

    if (usedFallback) {
      log.warn(
        `Preferred package manager ${pc.bold(preferredPackageManager)} is unavailable, fell back to ${pc.bold(packageManager)}`,
      )
    }

    // Read package names out of the raw args to resolve their extras.
    const deps = new Set(extractPackageNames(rawArgs))
    if (deps.size === 0) {
      outro(pc.dim("Done"))
      return
    }

    // Match extras, excluding universal (wildcard) entries so a package-targeted
    // install stays focused on the named packages. Read skills-lock.json so
    // already-installed skills get flagged and de-selected, same as the detect flow.
    const installedSkills = await matcherService.readSkillsLock(project)
    const matches = await matcherService.run({ deps, installedSkills })
    const matchedServers = matches.servers.filter((server) => !server.when.deps.includes("*"))
    const matchedSkills = matches.skills.filter((skill) => !skill.when.deps.includes("*"))

    // Apply --mcp / --skills scope, same semantics as the project install.
    const availableServers = skills && !mcp ? [] : matchedServers
    const availableSkills = mcp && !skills ? [] : matchedSkills

    if (availableServers.length === 0 && availableSkills.length === 0) {
      log.info(`No extras found for ${pc.bold([...deps].join(", "))}`)
      outro(pc.dim("Done"))
      return
    }

    const resolvedAgents = await this.resolveInstallAgents({
      agent,
      project,
      json,
      auto,
      hasServers: availableServers.length > 0,
      hasSkills: availableSkills.length > 0,
    })

    // Pick extras + agents: --auto installs everything. Agents come from --agent
    // or, when that's absent, from config / auto-detect (see resolveInstallAgents).
    // In non-interactive mode (JSON / non-TTY) we install extras only when target
    // agents resolved — otherwise we have no consent for which agents to write to,
    // so we report the matches and skip them (the named package itself is already
    // installed). Interactive mode prompts.
    let selection: SelectionResult | null
    if (auto) {
      if (!resolvedAgents) {
        log.error("No agents to install to. Pass --agent or pin agents via `bttrai config`.")
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
      if (!resolvedAgents) {
        const names = [...availableServers, ...availableSkills].map((extra) => extra.label)
        log.info(
          `Matched extras (${names.join(", ")}). Re-run with --agent (and --auto) to install them non-interactively.`,
        )
        outro(pc.dim("Done"))
        return
      }
      selection = {
        selectedServers: availableServers,
        selectedSkills: availableSkills,
        selectedMcpAgents: resolvedAgents.mcp,
        selectedSkillAgents: resolvedAgents.skill,
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
}

export const packageInstallService = new PackageInstallService()
