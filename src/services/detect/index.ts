import { log, outro } from "@clack/prompts"
import pc from "picocolors"
import { detectDeps } from "./utils"
import { matcherService } from "../matcher"
import {
  getSkillDetectionSource,
  getSkillDetectionSourceHint,
  getSkillDetectionSourceIcon,
} from "../shared/skill-source"
import { readSkillsLock, runDetectionWithProgress } from "../shared/utils"
import type { ServiceI } from "../service.interface"
import { theme } from "../../components/theme"
import type { DetectCommandInput, DetectInput, DetectJson, DetectResult } from "./types"

export const detectService = {
  // Core detection pipeline. Pure data flow — no UI/spinner concerns live here.
  async run({ project, onDeps, onProgress }: DetectInput): Promise<DetectResult> {
    // 1. Scan the project for dependencies (package.json, requirements.txt, etc).
    const deps = await detectDeps(project)
    // 2. Notify the caller as soon as deps are known so it can render "Found N deps"
    //    BEFORE the slower matcher (GitHub fetches) runs.
    onDeps?.(deps)
    // 3. Read skills-lock.json so we can flag already-installed skills.
    const installedSkills = await readSkillsLock(project)
    // 4. Stage 0 local node_modules scan (passing `project` opts in) → match
    //    deps against registry → fetch real skills from GitHub → fall back to
    //    registry-defined skills for sources that returned nothing. onProgress
    //    fires { phase: "local" }, { phase: "github" }, then { phase: "fallback" }.
    //    discover stays off here — too many deps for GitHub's Search quota.
    const matches = await matcherService.run({ deps, installedSkills, onProgress, project })

    return {
      project,
      deps,
      servers: matches.servers,
      matched: matches.skills,
    }
  },
  json(result: DetectResult): DetectJson {
    return {
      deps: [...result.deps],
      mcpServers: result.servers.map((server) => ({
        key: server.key,
        label: server.label,
        name: server.name,
      })),
      skills: result.matched.map((skill) => ({
        source: skill.source,
        label: skill.label,
        detectionSource: getSkillDetectionSource(skill),
        skills: skill.resolvedSkills,
        skillPaths: skill.resolvedSkillPaths,
      })),
    }
  },
  command(result: DetectResult): void {
    if (result.servers.length > 0) {
      log.success(pc.bold("MCP Servers"))
      for (const server of result.servers) {
        log.message(`  ${theme.bullet} ${server.label} ${theme.hint(`(${server.name})`)}`)
      }
    }

    if (result.matched.length > 0) {
      log.success(pc.bold("Skills"))
      for (const skill of result.matched) {
        const status = skill.installed ? pc.green(" [installed]") : ""
        const detectionSource = getSkillDetectionSource(skill)
        const sourceLabel = `${skill.resolvedSkills.length} ${getSkillDetectionSourceHint(skill)}`
        log.message(`  ${theme.bullet} ${skill.label} ${theme.hint(`— ${sourceLabel}`)}${status}`)
        if (detectionSource === "fallback") {
          log.message(`    ${pc.bold("Fallback")}`)
          for (const skillName of skill.resolvedSkills) {
            log.message(`      ${getSkillDetectionSourceIcon(skill)} ${skillName}`)
          }
        } else {
          // github + local both carry real paths; only the header differs.
          log.message(`    ${pc.bold(detectionSource === "local" ? "node_modules" : "GitHub")}`)
          for (const [index, skillName] of skill.resolvedSkills.entries()) {
            const skillPath = skill.resolvedSkillPaths[index] ?? skillName
            log.message(
              `      ${getSkillDetectionSourceIcon(skill)} ${skillName} ${theme.hint(`(${skillPath})`)}`,
            )
          }
        }
      }
    }

    if (result.servers.length === 0 && result.matched.length === 0) {
      log.warn("No matching MCP servers or skills found for this project.")
    }

    outro(pc.dim("Done"))
  },
} satisfies ServiceI<DetectInput, DetectResult, DetectJson>

// CLI entrypoint for `detect`. Wraps the service with progress UX and chooses
// between JSON output and a human-readable summary.
export async function detect({ json, ...input }: DetectCommandInput) {
  const result = await runDetectionWithProgress(input, { quiet: json })

  if (json) {
    console.log(JSON.stringify(detectService.json(result), null, 2))
    return
  }

  detectService.command(result)
}
