---
name: bttrai
description: How to use bttrai to detect, print, and install AI skills and MCP servers for your project
---

# bttrai — AI dependency manager

bttrai is a CLI that detects your project's stack and installs matching MCP servers and AI skills scoped to your project. It keeps your agent's context window lean by only loading what's relevant.

## Key commands

### Detect and print skills directly into chat

To load all relevant skills for the current project directly into the agent's context:

```bash
npx bttrai detect --print
```

This runs stack detection, fetches the raw SKILL.md content for every matched skill, and prints it to stdout. An agent can pipe or read this output to ingest domain-specific knowledge without installing anything.

### Detect and list matches

```bash
npx bttrai detect --list
```

Prints matched MCP servers and skills without installing. Use `--json` for machine-readable output:

```bash
npx bttrai detect --json
```

### Detect and install

```bash
npx bttrai detect
```

Interactive mode: detects your stack, shows matches, and prompts for agent selection. For non-interactive (CI/agent) usage:

```bash
npx bttrai detect --auto --agent cursor claude-code
```

### Install a specific package's extras

```bash
npx bttrai install ai
npx bttrai install ai zod --skills
npx bttrai install ai --mcp
```

### Reference: useful flags

| Flag | Description |
|------|-------------|
| `--print` | Print raw SKILL.md content to stdout (agent ingestion) |
| `--list` | Print matches only, install nothing |
| `--json` | Output machine-readable JSON |
| `--auto` | Skip prompts, auto-select matches |
| `--agent <name>` | Target specific agents (cursor, claude-code, etc.) |
| `--skills` | Only include skills |
| `--mcp` | Only include MCP servers |

## Agent workflow

When an agent needs project-specific knowledge, run:

```bash
npx bttrai detect --print
```

This outputs the full SKILL.md content for every skill matching the project's dependencies. The agent reads this output and gains domain-specific best practices, API patterns, and coding guidelines for the detected stack — without permanently modifying any config files.

For a permanent install into the agent's rules/config:

```bash
npx bttrai detect --auto --agent cursor
```
