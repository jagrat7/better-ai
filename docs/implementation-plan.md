# Implementation Plan: better-ai CLI

## Context

Building a standalone CLI tool (`better-ai`) that auto-installs MCP servers and agent skills by detecting a project's dependencies and matching them against a TypeScript registry. Replaces the hardcoded if/else chains in `create-better-t-stack`. Full spec at `docs/superpowers/specs/2026-03-16-better-ai-cli-design.md`.

## Step 1: Scaffold the project

- Run `bun init` in repo root (the `src/` lives at repo root, not inside `cli/` or `bt3-cli/`)
- Create `package.json` with:
  - `name: "better-ai"`, `type: "module"`, `bin: { "better-ai": "dist/cli.mjs" }`
  - `files: ["dist"]`
- Install deps: `bun add trpc-cli @trpc/server zod @clack/prompts execa picocolors`
- Install dev deps: `bun add -d typescript @types/node`
- Create `tsconfig.json` (strict, ESM, target ESNext)
- Add build script: `"build": "bun build src/cli.ts --outfile dist/cli.mjs --target node"`

**Files created:** `package.json`, `tsconfig.json`

## Step 2: Registry types and data

- Create `src/registry/types.ts` — `WhenCondition`, `McpServerEntry`, `SkillEntry` types
- Create `src/registry/mcp-servers.ts` — all 17 MCP server entries from spec
- Create `src/registry/skills.ts` — all 20 skill entries from spec (with conditionalSkills)

**Reference:** `bt3-cli/src/helpers/addons/mcp-setup.ts` (server definitions), `bt3-cli/src/helpers/addons/skills-setup.ts` (skill definitions)

**Files created:** `src/registry/types.ts`, `src/registry/mcp-servers.ts`, `src/registry/skills.ts`

## Step 3: Detector

- Create `src/detector.ts`
- Reads `package.json` from a given directory path
- Returns `Set<string>` of all dep names (dependencies + devDependencies merged)
- Throws clear error if `package.json` not found

**Files created:** `src/detector.ts`

## Step 4: Matcher

- Create `src/matcher.ts`
- `matchMcpServers(deps: Set<string>): McpServerEntry[]`
- `matchSkills(deps: Set<string>): ResolvedSkillEntry[]` (resolves conditionalSkills)
- Single `matches()` helper: `entry.when.deps.includes("*") || entry.when.deps.some(d => deps.has(d))`

**Files created:** `src/matcher.ts`

## Step 5: Installer

- Create `src/installer.ts`
- `installMcpServer(server, agents): Promise<boolean>` — runs `npx add-mcp@latest <target> --name <name> [-t transport] -a <agent> -y`
- `installSkillGroup(entry, agents): Promise<boolean>` — runs `npx skills@latest add <source> --skill <skills> --agent <agents> -y`
- Both use execa, run from project directory, return success/failure
- Progress output to stderr via picocolors

**Files created:** `src/installer.ts`

## Step 6: Prompts

- Create `src/prompts.ts`
- `selectMcpServers(matched): Promise<McpServerEntry[]>` — multiselect, all pre-selected
- `selectSkills(matched): Promise<ResolvedSkillEntry[]>` — multiselect, all pre-selected
- `selectAgents(): Promise<string[]>` — multiselect, defaults pre-selected
- All return full list if `--auto`, skip if nothing matched

**Files created:** `src/prompts.ts`

## Step 7: Commands

- Create `src/commands/detect.ts` — detect logic: call detector → matcher → output results
- Create `src/commands/install.ts` — install logic: detect → prompt (unless --auto) → install
- Both receive typed input from the router

**Files created:** `src/commands/detect.ts`, `src/commands/install.ts`

## Step 8: Router, index, CLI entry

- Create `src/router.ts` — tRPC router with `detect` (query) and `install` (mutation) procedures
  - Middleware: loads deps via detector, injects into context
  - detect input: `{ project: string, json: boolean }`
  - install input: `{ project: string, auto: boolean, mcp: boolean, skills: boolean, agent: string[], dryRun: boolean }`
- Create `src/index.ts` — programmatic exports (router, detect, install functions)
- Create `src/cli.ts` — `#!/usr/bin/env node`, imports router, calls `createCli({ router }).run()`

**Files created:** `src/router.ts`, `src/index.ts`, `src/cli.ts`

## Step 9: Build and verify

- Run `bun run build` — confirm it compiles
- Test locally: `node dist/cli.mjs --help`
- Test locally: `node dist/cli.mjs detect` in a project with known deps
- Test locally: `node dist/cli.mjs install --dry-run`
- Test: `node dist/cli.mjs detect --json | jq .` (valid JSON output)

## Critical Files

| File | Purpose |
|------|---------|
| `src/cli.ts` | Bin entry point |
| `src/index.ts` | Programmatic exports |
| `src/router.ts` | tRPC router definition |
| `src/commands/detect.ts` | Detect command |
| `src/commands/install.ts` | Install command |
| `src/registry/types.ts` | Registry type definitions |
| `src/registry/mcp-servers.ts` | MCP server registry data |
| `src/registry/skills.ts` | Skills registry data |
| `src/detector.ts` | package.json reader |
| `src/matcher.ts` | Registry matcher |
| `src/installer.ts` | execa install runner |
| `src/prompts.ts` | @clack/prompts wrappers |
| `bt3-cli/src/helpers/addons/mcp-setup.ts` | Reference: original MCP data |
| `bt3-cli/src/helpers/addons/skills-setup.ts` | Reference: original skills data |
