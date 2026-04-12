<div align="center">

![bttrai](./docs/logo.png)
</div>
<div align="center">

[![npm version](https://img.shields.io/npm/v/bttrai?style=for-the-badge&color=6B7280&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![license](https://img.shields.io/npm/l/bttrai?style=for-the-badge&color=6B7280&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![status alpha](https://img.shields.io/badge/status-alpha-9CA3AF?style=for-the-badge&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![view on npmx.dev](https://img.shields.io/badge/view-npmx.dev-8B5CF6?style=for-the-badge&color=6B7280&labelColor=374151)](https://npmx.dev/package/bttrai)

</div>

> *"Too lazy to look for the skills and mcps for your project?"*

Auto-install matching MCP servers and agent skills based on your project's stack. `bttrai` scans your project dependencies, suggests relevant MCP servers and skills, and installs them into the agents you choose.

## Install

You can run `bttrai` without installing it globally:

```bash
npx bttrai
```

Or install it globally:

```bash
npm i -g bttrai
bttrai
```

## Commands

| Command | Description |
| --- | --- |
| `bttrai` | Default install flow |
| `bttrai detect` | Detect matching MCP servers and skills |
| `bttrai install` | Run the install flow explicitly |

## Common usage

```bash
# Detect what matches the current project
npx bttrai detect

# Run the full install flow
npx bttrai

# Output JSON for scripts/automation
npx bttrai detect --json

# Install for a different project directory
npx bttrai install --project ./my-app

# Auto-approve install for specific agents
npx bttrai install --auto --agent cursor claude-code

# Install only skills
npx bttrai install --skills

# Install only MCP servers
npx bttrai install --mcp
```

## Options

| Option | Applies to | Description |
| --- | --- | --- |
| `--project <path>` | `detect`, `install` | Target a different project directory |
| `--json` | `detect`, `install` | Output machine-readable JSON |
| `--auto` | `install` | Skip prompts and auto-select detected matches |
| `--agent <name>` | `install` | Choose one or more agents to install into |
| `--skills` | `install` | Only include skills |
| `--mcp` | `install` | Only include MCP servers |

## Notes

- `--auto` requires at least one `--agent`.
- If your project prefers `bun`, `pnpm`, `yarn`, or `deno` but that runner is not available, `bttrai` falls back to `npx` automatically.
- If an installer fails, `bttrai` prints the exact manual command to run for `skills` or `add-mcp`.

## Example flow

1. Scan the project dependencies
2. Match relevant MCP servers and skills
3. Let you confirm what to install
4. Ask which agents to target
5. Run the installer packages on your machine

## Supported agent categories

| Category | Examples |
| --- | --- |
| MCP targets | Cursor, Claude Code, VS Code, Zed, Gemini CLI |
| Skill targets | Cursor, Claude Code, GitHub Copilot, Continue, Windsurf |

