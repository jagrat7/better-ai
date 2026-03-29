/**
 * Fetches official skills from skills.sh and merges them with the existing
 * curated skills registry. New skills are added with empty `when` conditions
 * for manual review.
 *
 * Usage: bun run scripts/sync-skills.ts
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

const SKILLS_REGISTRY_PATH = resolve(import.meta.dirname ?? ".", "../src/registry/skills.ts")
const SKILLS_API_BASE = "https://skills.sh"

// Official orgs scraped from https://skills.sh/official
// Each entry is the org slug used on skills.sh
const OFFICIAL_ORGS = [
  "anthropics",
  "apify",
  "apollographql",
  "auth0",
  "automattic",
  "axiomhq",
  "base",
  "better-auth",
  "bitwarden",
  "box",
  "brave",
  "browser-use",
  "browserbase",
  "callstackincubator",
  "clerk",
  "clickhouse",
  "cloudflare",
  "coderabbitai",
  "coinbase",
  "dagster-io",
  "datadog-labs",
  "dbt-labs",
  "denoland",
  "elevenlabs",
  "encoredev",
  "expo",
  "facebook",
  "figma",
  "firebase",
  "firecrawl",
  "flutter",
  "getsentry",
  "github",
  "google-gemini",
  "google-labs-code",
  "hashicorp",
  "huggingface",
  "kotlin",
  "langchain-ai",
  "langfuse",
  "launchdarkly",
  "livekit",
  "makenotion",
  "mapbox",
  "mastra-ai",
  "mcp-use",
  "medusajs",
  "microsoft",
  "n8n-io",
  "neondatabase",
  "nuxt",
  "openai",
  "openshift",
  "planetscale",
  "posthog",
  "prisma",
  "pulumi",
  "pytorch",
  "redis",
  "remotion-dev",
  "resend",
  "rivet-dev",
  "runwayml",
  "sanity-io",
  "semgrep",
  "streamlit",
  "stripe",
  "supabase",
  "sveltejs",
  "tavily-ai",
  "tinybirdco",
  "tldraw",
  "triggerdotdev",
  "upstash",
  "vercel",
  "vercel-labs",
  "webflow",
  "wix",
  "wordpress",
] as const

type ApiSkill = {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

type ApiSearchResponse = {
  skills: ApiSkill[]
  count: number
}

type ExistingSkillEntry = {
  source: string
  label: string
  skills: string[]
  conditionalSkills?: {
    when: { deps: string[] }
    skills: string[]
  }[]
  when: { deps: string[] }
}

// -- Fetch all skills for a given org from the search API --
async function fetchOrgSkills(org: string): Promise<ApiSkill[]> {
  const url = `${SKILLS_API_BASE}/api/search?q=${encodeURIComponent(org)}&limit=50`
  const res = await fetch(url)
  if (!res.ok) return []

  const data = (await res.json()) as ApiSearchResponse
  // Filter to only skills whose source starts with this org
  return data.skills.filter((s) => s.source.startsWith(`${org}/`))
}

// -- Parse the existing skills.ts to extract current entries --
function parseExistingSkills(): ExistingSkillEntry[] {
  const content = readFileSync(SKILLS_REGISTRY_PATH, "utf-8")

  // Extract the array content between the brackets
  const match = content.match(/export const skills:\s*SkillEntry\[\]\s*=\s*\[([\s\S]*)\]/)
  if (!match?.[1]) {
    console.error("Could not parse existing skills.ts")
    return []
  }

  // Use a simpler approach: eval-like parsing via Function constructor
  // Safe here since we control the input file
  const fn = new Function(`return [${match[1]}]`)
  return fn() as ExistingSkillEntry[]
}

// -- Group API skills by source (owner/repo) --
function groupBySource(skills: ApiSkill[]): Map<string, ApiSkill[]> {
  const map = new Map<string, ApiSkill[]>()
  for (const skill of skills) {
    const existing = map.get(skill.source) ?? []
    existing.push(skill)
    map.set(skill.source, existing)
  }
  return map
}

// -- Generate the label from a source string --
function sourceToLabel(source: string): string {
  const repo = source.split("/")[1] ?? source
  return repo
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// -- Serialize a SkillEntry to TypeScript code --
function serializeEntry(entry: ExistingSkillEntry): string {
  const lines: string[] = []
  lines.push("  {")
  lines.push(`    source: ${JSON.stringify(entry.source)},`)
  lines.push(`    label: ${JSON.stringify(entry.label)},`)
  lines.push(`    skills: ${JSON.stringify(entry.skills)},`)

  if (entry.conditionalSkills?.length) {
    lines.push("    conditionalSkills: [")
    for (const cs of entry.conditionalSkills) {
      lines.push("      {")
      lines.push(`        when: { deps: ${JSON.stringify(cs.when.deps)} },`)
      lines.push(`        skills: ${JSON.stringify(cs.skills)},`)
      lines.push("      },")
    }
    lines.push("    ],")
  }

  lines.push(`    when: { deps: ${JSON.stringify(entry.when.deps)} },`)
  lines.push("  }")

  return lines.join("\n")
}

// -- Main --
async function main() {
  console.log("Fetching official skills from skills.sh...")

  const allApiSkills: ApiSkill[] = []
  let fetched = 0

  for (const org of OFFICIAL_ORGS) {
    const skills = await fetchOrgSkills(org)
    allApiSkills.push(...skills)
    fetched++
    if (fetched % 10 === 0) {
      console.log(`  Fetched ${fetched}/${OFFICIAL_ORGS.length} orgs...`)
    }
    // Small delay to be nice to the API
    await new Promise((r) => setTimeout(r, 100))
  }

  console.log(`Fetched ${allApiSkills.length} skills from ${OFFICIAL_ORGS.length} official orgs`)

  const existingEntries = parseExistingSkills()
  const existingBySource = new Map(existingEntries.map((e) => [e.source, e]))

  const grouped = groupBySource(allApiSkills)

  const mergedEntries: ExistingSkillEntry[] = []
  const newSources: string[] = []
  const updatedSources: string[] = []

  // First, keep all existing entries (preserving order and `when` conditions)
  for (const existing of existingEntries) {
    const apiSkills = grouped.get(existing.source)
    if (apiSkills) {
      // Merge: add any new skill names from API that aren't already listed
      const existingSkillNames = new Set([
        ...existing.skills,
        ...(existing.conditionalSkills?.flatMap((cs) => cs.skills) ?? []),
      ])
      const newSkillNames = apiSkills
        .map((s) => s.name)
        .filter((name) => !existingSkillNames.has(name))

      if (newSkillNames.length > 0) {
        updatedSources.push(`${existing.source} (+${newSkillNames.join(", ")})`)
        mergedEntries.push({
          ...existing,
          skills: [...existing.skills, ...newSkillNames],
        })
      } else {
        mergedEntries.push(existing)
      }
      grouped.delete(existing.source)
    } else {
      mergedEntries.push(existing)
    }
  }

  // Then, add new sources from the API that don't exist yet
  for (const [source, apiSkills] of grouped) {
    const skillNames = apiSkills.map((s) => s.name)
    newSources.push(source)
    mergedEntries.push({
      source,
      label: sourceToLabel(source),
      skills: skillNames,
      when: { deps: [] }, // Empty — needs manual curation
    })
  }

  // Generate the output file
  const serialized = mergedEntries.map(serializeEntry).join(",\n")
  const output = `import type { SkillEntry } from "./types"

export const skills: SkillEntry[] = [
${serialized},
]
`

  writeFileSync(SKILLS_REGISTRY_PATH, output)

  // Summary
  console.log("\n--- Sync Summary ---")
  console.log(`Total entries: ${mergedEntries.length}`)
  console.log(`Existing (unchanged): ${existingEntries.length - updatedSources.length}`)

  if (updatedSources.length > 0) {
    console.log(`\nUpdated (new skills added):`)
    for (const s of updatedSources) {
      console.log(`  + ${s}`)
    }
  }

  if (newSources.length > 0) {
    console.log(`\nNew sources (needs \`when.deps\` curation):`)
    for (const s of newSources) {
      console.log(`  * ${s}`)
    }
  }

  console.log(`\nWrote to ${SKILLS_REGISTRY_PATH}`)
}

main().catch(console.error)
