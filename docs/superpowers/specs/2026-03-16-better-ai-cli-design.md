# better-ai CLI — Design Spec

## Context

The `create-better-t-stack` CLI includes MCP server and agent skills auto-installation as addons. The recommendation logic is ~200 lines of hardcoded if/else chains matching project config fields to server/skill names. This is not extensible.

`better-ai` is a standalone CLI that replaces those if/else chains with a data-driven TypeScript registry. It reads any project's `package.json`, detects the stack from dependencies, matches against the registry, and installs the right MCP servers + skills via `npx add-mcp@latest` and `npx skills@latest add`.

The registry is designed to be importable by `create-better-t-stack` via a future PR, so it can drop its hardcoded logic and depend on `better-ai` for recommendations.

---

## Commands

### `better-ai detect [project-path]`

Scans a project and shows matched MCP servers + skills.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `project-path` | positional | `"."` | Path to project directory |
| `--json` | boolean | `false` | Output as JSON to stdout |

### `better-ai install [project-path]`

Detects stack, prompts for selection, installs MCP servers and/or skills.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `project-path` | positional | `"."` | Path to project directory |
| `--auto` | boolean | `false` | Skip all prompts, install everything matched |
| `--mcp` | boolean | `false` | Install MCP servers only |
| `--skills` | boolean | `false` | Install skills only |
| `--agent` | string[] | - | Target agents (overrides prompt/defaults) |
| `--dry-run` | boolean | `false` | Show what would be installed without installing |

When neither `--mcp` nor `--skills` is passed, both are installed.

Default agents (used with `--auto`): `["cursor", "claude-code", "vscode"]`

---

## Project Structure

```
better-ai/
├── src/
│   ├── cli.ts                  ← bin entry: #!/usr/bin/env node
│   ├── index.ts                ← programmatic exports (router, detect, install)
│   ├── router.ts               ← tRPC router: detect + install
│   ├── commands/
│   │   ├── detect.ts           ← detect command logic
│   │   └── install.ts          ← install command logic
│   ├── registry/
│   │   ├── types.ts            ← McpServerEntry, SkillEntry, WhenCondition types
│   │   ├── mcp-servers.ts      ← export const mcpServers: McpServerEntry[]
│   │   └── skills.ts           ← export const skills: SkillEntry[]
│   ├── detector.ts             ← reads package.json → Set<string> of dep names
│   ├── matcher.ts              ← (deps, registry) → matched entries
│   ├── installer.ts            ← runs execa commands
│   └── prompts.ts              ← @clack/prompts wrappers
├── package.json
└── tsconfig.json
```

### File Responsibilities

**`cli.ts`** — Bin entry point. Imports router, calls `createCli({ router }).run()`. Has shebang `#!/usr/bin/env node`. No other logic.

**`index.ts`** — Programmatic API exports. Exports `router`, `detect()`, `install()` functions. No side effects (no CLI execution).

**`router.ts`** — tRPC router definition with two procedures: `detect` (query) and `install` (mutation). Uses zod for input validation. Middleware loads project config via `detector.ts` and injects into context.

**`detector.ts`** — Reads `package.json` from a given path. Returns a `Set<string>` of all dependency names (dependencies + devDependencies). Designed to be pluggable: future detectors for `pyproject.toml`, `Cargo.toml`, etc. follow the same interface.

**`matcher.ts`** — Takes a `Set<string>` of deps and a registry array. Returns entries where `when.deps` overlaps with the detected deps. Single function works for both MCP servers and skills.

**`installer.ts`** — Runs install commands via execa. Two functions: `installMcpServer()` and `installSkills()`. Handles per-server error recovery (skip failed, continue).

**`prompts.ts`** — Wraps `@clack/prompts` multiselect for server selection, skill selection, and agent selection. Skipped entirely when `--auto` is passed.

---

## Dependencies

**Runtime:**
- `trpc-cli` — CLI framework (wraps commander)
- `@trpc/server` — tRPC router definition
- `zod` — input validation
- `@clack/prompts` — interactive terminal prompts
- `execa` — running shell commands
- `picocolors` — terminal colors

**Dev:**
- `typescript`
- `@types/node`

**Build:** `bun build` (no extra bundler)

---

## Registry Format

### McpServerEntry (registry/types.ts)

```ts
type WhenCondition = {
  deps: string[]  // match if ANY dep exists in project ("*" = always)
}

type McpServerEntry = {
  name: string           // server name for --name flag
  label: string          // display name in prompts
  target: string         // npx command or URL
  transport?: "sse" | "http"  // default: stdio
  when: WhenCondition
}
```

### SkillEntry (registry/types.ts)

```ts
type SkillEntry = {
  source: string         // GitHub shorthand (e.g., "clerk/skills")
  label: string          // display name in prompts
  skills: string[]       // base skill names always installed when matched
  conditionalSkills?: {  // extra skills installed when additional deps are present
    deps: string[]       // match if ANY of these deps exist
    skills: string[]     // skill names to add
  }[]
  when: WhenCondition
}
```

This handles cases like Clerk (add `clerk-nextjs-patterns` only when `next` is also a dep) without needing functions in the registry. The matcher resolves conditional skills at match time:

```ts
function resolveSkills(entry: SkillEntry, projectDeps: Set<string>): string[] {
  const skills = [...entry.skills]
  for (const cond of entry.conditionalSkills ?? []) {
    if (cond.deps.some(d => projectDeps.has(d))) {
      skills.push(...cond.skills)
    }
  }
  return skills
}
```

### Matching Logic

```ts
function matches(entry: { when: WhenCondition }, projectDeps: Set<string>): boolean {
  return entry.when.deps.includes("*") || entry.when.deps.some(d => projectDeps.has(d))
}
```

One function, used for both registries. OR logic: if any dep in the condition exists in the project, the entry matches.

---

## Data Flow

```
User runs: npx better-ai install --auto
  │
  ▼
cli.ts → router.ts
  trpc-cli parses argv → { auto: true, project: "." }
  middleware calls detector.ts
  │
  ▼
detector.ts
  reads ./package.json
  returns Set<string> ["next", "@clerk/nextjs", "drizzle-orm", ...]
  │
  ▼
matcher.ts
  loads mcp-servers.ts and skills.ts
  filters entries where when.deps overlaps with detected deps
  returns { mcpServers: McpServerEntry[], skills: SkillEntry[] }
  │
  ▼
prompts.ts (SKIPPED — --auto flag)
  │
  ▼
installer.ts
  for each MCP server:
    execa: npx add-mcp@latest <target> --name <name> -a cursor -a claude-code -a vscode -y
  for each skill group:
    execa: npx skills@latest add <source> --skill <s1> <s2> --agent cursor claude-code vscode -y
  │
  ▼
stderr: progress ("Installing context7...", "Installing clerk skills...")
stdout: summary JSON or human-readable result
exit 0 on success, exit 1 on failure
```

---

## Registry Data

Converted from bt3-cli's hardcoded if/else chains.

### MCP Servers (from bt3-cli/src/helpers/addons/mcp-setup.ts)

| name | target | transport | when.deps |
|------|--------|-----------|-----------|
| context7 | @upstash/context7-mcp | stdio | ["*"] |
| shadcn | npx -y shadcn@latest mcp | stdio | ["next", "react-router-dom", "@tanstack/react-router", "@tanstack/react-start"] |
| next-devtools | npx -y next-devtools-mcp@latest | stdio | ["next"] |
| nuxt | https://nuxt.com/mcp | sse | ["nuxt"] |
| nuxt-ui | https://ui.nuxt.com/mcp | sse | ["nuxt"] (intentional — any nuxt project likely uses nuxt-ui) |
| svelte | https://mcp.svelte.dev/mcp | sse | ["svelte", "@sveltejs/kit"] |
| astro-docs | https://mcp.docs.astro.build/mcp | sse | ["astro"] |
| cloudflare-docs | https://docs.mcp.cloudflare.com/sse | sse | ["wrangler", "@cloudflare/workers-types"] |
| convex | npx -y convex@latest mcp start | stdio | ["convex"] |
| nx | npx nx mcp . | stdio | ["nx"] |
| planetscale | https://mcp.pscale.dev/mcp/planetscale | sse | ["@planetscale/database"] |
| neon | https://mcp.neon.tech/mcp | sse | ["@neondatabase/serverless"] |
| supabase | https://mcp.supabase.com/mcp | sse | ["@supabase/supabase-js"] |
| better-auth | https://mcp.inkeep.com/better-auth/mcp | sse | ["better-auth"] |
| clerk | https://mcp.clerk.com/mcp | sse | ["@clerk/nextjs", "@clerk/express", "@clerk/backend"] |
| expo | https://mcp.expo.dev/mcp | sse | ["expo", "expo-router"] |
| polar | https://mcp.polar.sh/mcp/polar-mcp | sse | ["@polar-sh/sdk"] |

### Skills (from bt3-cli/src/helpers/addons/skills-setup.ts)

| source | skills | conditionalSkills | when.deps |
|--------|--------|-------------------|-----------|
| vercel-labs/agent-skills | web-design-guidelines, vercel-composition-patterns, vercel-react-best-practices | +vercel-react-native-skills when ["expo", "react-native"] | ["next", "react-router-dom", "@tanstack/react-router"] |
| vercel-labs/next-skills | next-best-practices, next-cache-components | - | ["next"] |
| shadcn/ui | shadcn | - | ["next", "react-router-dom", "@tanstack/react-router"] |
| nuxt/ui | nuxt-ui | - | ["nuxt"] |
| heroui-inc/heroui | heroui-native | - | ["@heroui/react"] |
| better-auth/skills | better-auth-best-practices | - | ["better-auth"] |
| clerk/skills | clerk, clerk-setup, clerk-custom-ui, clerk-webhooks, clerk-testing, clerk-orgs | +clerk-nextjs-patterns when ["next"] | ["@clerk/nextjs", "@clerk/express", "@clerk/backend"] |
| neondatabase/agent-skills | neon-postgres | - | ["@neondatabase/serverless"] |
| supabase/agent-skills | supabase-postgres-best-practices | - | ["@supabase/supabase-js"] |
| planetscale/database-skills | postgres, neki | - | ["@planetscale/database"] |
| prisma/skills | prisma-cli, prisma-client-api, prisma-database-setup | +prisma-postgres when ["@prisma/extension-accelerate"] | ["prisma", "@prisma/client"] |
| expo/skills | expo-dev-client, building-native-ui, native-data-fetching, expo-deployment, upgrading-expo, expo-cicd-workflows | +expo-tailwind-setup when ["nativewind"] | ["expo", "expo-router"] |
| vercel/ai | ai-sdk | - | ["ai", "@ai-sdk/openai", "@ai-sdk/anthropic"] |
| vercel/turborepo | turborepo | - | ["turbo"] |
| yusukebe/hono-skill | hono | - | ["hono"] |
| elysiajs/skills | elysiajs | - | ["elysia"] |
| waynesutton/convexskills | convex-best-practices, convex-functions, convex-schema-validator, convex-realtime, convex-http-actions, convex-cron-jobs, convex-file-storage, convex-migrations, convex-security-check | - | ["convex"] |
| msmps/opentui-skill | opentui | - | ["@opentui/core"] |
| haydenbleasel/ultracite | ultracite | - | ["ultracite"] |

---

## CLI Conventions

Per the best practices in docs/cli-best-practices.md:

- **stdout** — data output (JSON with `--json`, summary on install)
- **stderr** — progress, spinners, warnings
- **exit 0** — success
- **exit 1** — error
- **exit 2** — bad usage (invalid flags)
- **`--help`** and **`--version`** — auto-generated by trpc-cli
- **TTY detection** — show @clack/prompts only when interactive, skip when piped
- **`--dry-run`** — show what would happen, install nothing

---

## Verification

1. `bun build src/cli.ts --outfile dist/cli.mjs --target node` compiles without errors
2. `npx better-ai detect` in a Next.js project shows matched servers/skills
3. `npx better-ai detect --json` outputs valid JSON to stdout
4. `npx better-ai install --dry-run` shows what would be installed without running anything
5. `npx better-ai install --auto` installs all matched servers + skills with default agents
6. `npx better-ai install --mcp` installs only MCP servers
7. `npx better-ai install --skills` installs only skills
8. `npx better-ai install --agent cursor` uses only the specified agent
9. `npx better-ai --help` shows usage
10. `npx better-ai --version` shows version
