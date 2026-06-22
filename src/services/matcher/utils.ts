import type { WhenCondition } from "../../registry/types"

/**
 * Repos named exactly "skills" (e.g. `better-auth/skills`) hold all their SKILL.md
 * files at the top level instead of under a `skills/` subdirectory. We detect this
 * to relax the path filter for those repos.
 */
export const githubSkillsRepoName = "skills"
/**
 * Optional token lifts both rate-limit buckets: core REST 60→5,000/hr (git/trees)
 * and Search 10→30/min. Falls back to unauthenticated when neither var is set.
 */
export const githubToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
export const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "better-ai",
  ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
}

/**
 * Check if a when condition matches the project's dependencies.
 * @param when The when condition to check
 * @param deps The project's dependencies
 * @returns True if the condition matches, false otherwise
 */
export function matches(when: WhenCondition, deps: Set<string>): boolean {
  return when.deps.includes("*") || when.deps.some((d) => deps.has(d))
}
/**
 * Discovers every folder containing a SKILL.md in a GitHub repo via one
 * recursive git-tree API call (single request regardless of repo size).
 * @returns Directory paths (relative to repo root) — not slugs.
 */
export async function getRepoSkillPaths(repo: string): Promise<string[]> {
  // Repos literally named "skills" get a relaxed filter (any SKILL.md counts).
  const isSkillsRepo = repo.split("/").at(-1) === githubSkillsRepoName

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,
      {
        headers: githubHeaders,
      },
    )
    // Network errors, 404s, rate limits, etc. → caller falls back to registry.
    if (!response.ok) return []

    const { tree = [] } = (await response.json()) as {
      tree?: Array<{ path?: string; type?: string }>
    }

    return [
      ...new Set(
        tree.flatMap((item) => {
          // Only consider files literally named SKILL.md.
          if (item.type !== "blob" || !item.path?.endsWith("/SKILL.md")) return []
          // Strip the trailing "/SKILL.md" to get the skill's folder path.
          const skillPath = item.path.slice(0, item.path.lastIndexOf("/"))
          // Require a `skills/` segment somewhere in the path — prevents picking
          // up SKILL.md files from unrelated nested directories. The skills-named
          // repo escape hatch above bypasses this.
          const inSkillsDir = skillPath.split("/").includes(githubSkillsRepoName)
          return inSkillsDir || isSkillsRepo ? [skillPath] : []
        }),
      ),
    ].sort()
  } catch {
    return []
  }
}

/**
 * For each skill folder found by getRepoSkillPaths, fetch its SKILL.md and
 * parse the YAML frontmatter `name:` field. That slug is what `skills@latest`
 * expects as the --skill argument (it may differ from the folder name, e.g.
 * folder `use-ai-sdk` declares `name: ai-sdk`).
 */
export async function discoverRepoSkills(
  repo: string,
): Promise<Array<{ name: string; path: string }>> {
  const skillPaths = await getRepoSkillPaths(repo)

  const results = await Promise.all(
    skillPaths.map(async (skillPath) => {
      // Fallback used when fetch/parse fails — last path segment is usually
      // close enough to the slug.
      const folderName = skillPath.slice(skillPath.lastIndexOf("/") + 1)
      try {
        // raw.githubusercontent.com is a CDN with no auth rate limits, unlike
        // api.github.com. Safe to call once per discovered skill.
        const response = await fetch(
          `https://raw.githubusercontent.com/${repo}/HEAD/${skillPath}/SKILL.md`,
        )
        if (!response.ok) return { name: folderName, path: skillPath }
        const text = await response.text()
        // Extract YAML frontmatter block between leading `---` fences.
        const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? ""
        // Capture `name: value` supporting double-quoted, single-quoted, and bare values.
        const nameMatch = frontmatter.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|(.+?))\s*$/m)
        const slug = (nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3])?.trim()
        return { name: slug ?? folderName, path: skillPath }
      } catch {
        return { name: folderName, path: skillPath }
      }
    }),
  )

  // Deduplicate by skill name — repos like stripe/ai mirror the same SKILL.md
  // under multiple skills/ subdirectories. Paths are sorted alphabetically, so
  // we keep the first occurrence (path only drives display; --skill uses name).
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.name)) return false
    seen.add(r.name)
    return true
  })
}

/**
 * Resolve an npm package to its GitHub "owner/repo" via the registry's
 * repository.url field. Used as the first dynamic-discovery signal — works
 * when a package keeps its skills inside its own source repo (e.g. vercel/ai).
 * @returns "owner/repo", or null for missing metadata or non-GitHub repos.
 */
export async function resolveNpmRepo(pkg: string): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${pkg}`)
    if (!response.ok) return null
    const data = (await response.json()) as { repository?: string | { url?: string } }
    const url = typeof data.repository === "string" ? data.repository : data.repository?.url
    if (!url) return null
    // Handle git+https://github.com/owner/repo.git, git://…, and git@github.com:owner/repo.
    const match = url.match(/github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/#?]|$)/)
    return match ? `${match[1]}/${match[2]}` : null
  } catch {
    return null
  }
}

/**
 * Run a GitHub repo search, tree-scan each hit, and return the first repo that
 * actually holds a SKILL.md. Shared by the owner-scoped and global search tiers.
 */
export async function resolveFromSearch(
  query: string,
  dep: string,
): Promise<{ source: string; dep: string; skills: Array<{ name: string; path: string }> } | null> {
  try {
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=5`,
      { headers: githubHeaders },
    )
    if (!response.ok) return null
    const { items = [] } = (await response.json()) as { items?: Array<{ full_name?: string }> }
    for (const item of items) {
      if (!item.full_name) continue
      const skills = await discoverRepoSkills(item.full_name)
      if (skills.length > 0) return { source: item.full_name, dep, skills }
    }
    return null
  } catch {
    return null
  }
}
