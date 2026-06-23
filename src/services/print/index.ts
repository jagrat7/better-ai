import { discoverRepoSkills, fetchRawFile } from "../matcher/utils"
import type { ServiceI } from "../service.interface"
import type { PrintInput, PrintJson, PrintResult } from "./types"

export const printService = {
  // Print a single file from a skill in its GitHub source. The skill is matched
  // by frontmatter `name` (the folder may differ — `use-ai-sdk` can declare
  // `name: ai-sdk`); `file` selects what to print, relative to that folder, and
  // defaults to SKILL.md. References are fetched on demand via a separate call so
  // the default output stays just the instructions, not the whole bundle.
  async run({ source, skill, file }: PrintInput): Promise<PrintResult> {
    const available = await discoverRepoSkills(source)
    const match = available.find((entry) => entry.name === skill)
    if (!match) {
      const names = available.map((entry) => entry.name).join(", ")
      throw new Error(
        names
          ? `Skill "${skill}" not found in ${source}. Available: ${names}`
          : `No skills found in ${source}.`,
      )
    }

    const path = file ?? "SKILL.md"
    const content = await fetchRawFile(source, `${match.path}/${path}`)
    if (content === null) {
      throw new Error(`File "${path}" not found in skill "${skill}" (${source}).`)
    }

    return { source, skill, path, content }
  },
  json(result: PrintResult): PrintJson {
    return result
  },
  // Plain stdout, for an agent to read directly. The header names the source +
  // file so provenance survives a copy-paste into chat.
  command(result: PrintResult): void {
    console.log(`# skill: ${result.skill} · ${result.source} — ${result.path}\n`)
    console.log(result.content)
  },
} satisfies ServiceI<PrintInput, PrintResult, PrintJson>
