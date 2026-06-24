---
name: bttrai
description: How to use bttrai to detect, print, and install AI skills and MCP servers for your project
---

# bttrai — AI dependency manager

bttrai is a CLI that finds the MCP servers and AI skills matching your project's dependencies and installs them scoped to your project. It keeps an agent's context window lean by loading only what's relevant. Three ways to use it:

- **`install`** — add a package and pull in its matching MCP servers + skills (most exhaustive)
- **`detect`** — scan a project for matches (WIP; best targeted at a single dependency)
- **`print`** — dump a skill's `SKILL.md` (or a reference file) to stdout for an agent to read

## `install` — add a package and its matching extras

The primary path. Installs the package and any MCP servers + skills the registry maps to it.

```bash
# Install a package plus its matching MCP servers + skills
npx bttrai install ai

# Install multiple packages, skills only
npx bttrai install ai zod --skills

# MCP servers only
npx bttrai install ai --mcp

# Non-interactive, into a specific agent
npx bttrai install ai --auto --agent cursor claude-code
```

Forward native package-manager flags after `--` (e.g. `npx bttrai install ai -- -D`).

## `detect` — scan a project for matches

Detects dependencies already in the project and installs matching extras. **This is WIP** — full-stack detection only catches direct registry matches and is less exhaustive than `install`. Prefer targeting a **single dependency**, which is reliable:

```bash
# Recommended: detect matches for one dependency
npx bttrai detect zod
npx bttrai detect --dep zod

# Full-stack scan of the current project (WIP — may miss matches)
npx bttrai detect

# Run against another directory
npx bttrai detect ./my-app

# Non-interactive install of what's found
npx bttrai detect --auto --agent cursor

# Inspect matches without installing
npx bttrai detect --list
npx bttrai detect --json
```

## `print` — fetch a skill file from its source repo

Print a skill straight to stdout so an agent can read it into context without installing anything.

```bash
npx bttrai print <source> <skill> [file]
```

- `<source>` — the skill's source repo as `owner/repo` (e.g. `vercel/ai`)
- `<skill>` — the skill name from its frontmatter (e.g. `ai-sdk`; the folder may differ)
- `[file]` — optional file within the skill folder; defaults to `SKILL.md`

```bash
# Print a skill's SKILL.md
npx bttrai print vercel/ai ai-sdk

# Print a specific reference file within the skill (loaded on demand)
npx bttrai print vercel/ai ai-sdk references/common-errors.md

# Machine-readable output
npx bttrai print vercel/ai ai-sdk --json
```

Output is plain stdout with a provenance header (`# skill: ai-sdk · vercel/ai — SKILL.md`) so it survives a copy-paste into chat. Alias: `npx bttrai prs`.

### Agent workflow: pull matched skills into context

Chain `detect --print` with `print` to load relevant skills without installing. `detect --print` emits one runnable `print` command per matched skill:

```bash
$ npx bttrai detect --print
npx bttrai print vercel/ai ai-sdk
npx bttrai print colinhacks/zod zod
```

The agent reads each skill's `SKILL.md` first, then fetches a specific reference only when it actually needs one — keeping the default output lean.

## Reference: useful flags

| Flag | Applies to | Description |
|------|------------|-------------|
| `--dep <name>` | `detect` | Detect matches for a single dependency (preferred while detect is WIP) |
| `--print` | `detect` | Emit a runnable `print` command per matched skill, install nothing |
| `--list` | `detect` | Print matches only, install nothing |
| `--auto` | `detect`, `install` | Skip prompts, auto-select matches |
| `--agent <name>` | `detect`, `install` | Target specific agents (cursor, claude-code, etc.) |
| `--skills` | `detect`, `install` | Only include skills |
| `--mcp` | `detect`, `install` | Only include MCP servers |
| `--json` | `detect`, `print`, `install` | Output machine-readable JSON |
