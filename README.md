<div align="center">

![bttrai](./docs/logo.png)

</div>
<div align="center">

[![npm version](https://img.shields.io/npm/v/bttrai?style=for-the-badge&color=6B7280&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![license](https://img.shields.io/npm/l/bttrai?style=for-the-badge&color=6B7280&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![status alpha](https://img.shields.io/badge/status-alpha-9CA3AF?style=for-the-badge&labelColor=374151)](https://www.npmjs.com/package/bttrai) [![view on npmx.dev](https://img.shields.io/badge/view-npmx.dev-8B5CF6?style=for-the-badge&color=6B7280&labelColor=374151)](https://npmx.dev/package/bttrai)

</div>

## Overview

A CLI that auto-installs MCP servers and skills to your agent(s) based on your project's stack. It uses [skills](https://github.com/vercel-labs/skills) and [add-mcp](https://github.com/neondatabase/add-mcp) CLIs under the hood.

```bash
npx bttrai
```

## Why better-ai

This initially started because I was too lazy to add individual skills and MCP installs for my individual projects, and as a result I was unnecessarily inflating my context window (system prompt) by installing everything globally. Research like [this paper](https://arxiv.org/abs/2505.10554) has shown that overloaded system prompts hurt performance. By scoping installs to the project level, `bttrai` keeps your context window lean and relevant.

As I was building this, I hope this project will provide a way to **democratize** and **standardize** development with AI. The standardization part will require community support to maintain a legit list/registry of MCPs and skills. Check out the [contributing guide](.github/CONTRIBUTING.md) for more info. I used the following sources to build the registry of MCPs and skills:

- [Aman's list in create-better-t-stack](create-better-t-stack)
- [Vercel's official skills registry](https://skills.sh/official)
- Manual search

## Usage

```bash

# Detect and install matches in your current directory
npx bttrai

# Run against a different project directory
npx bttrai ./my-app

# Auto-approve — agents resolve automatically (no --agent needed)
npx bttrai --auto

# ...or pin specific agents for this run
npx bttrai --auto --agent cursor claude-code

# Install only skills
npx bttrai --skills

# Install only MCP servers
npx bttrai --mcp

# Print matches without installing anything
npx bttrai detect --list

# Output JSON for scripts/automation (no execution)
npx bttrai detect --json

# Install a package AND its matching MCP servers + skills
npx bttrai install ai
npx bttrai install ai zod

# Native package-manager flags go AFTER `--` (forwarded verbatim)
npx bttrai install ai -- -D
npx bttrai install ai@5 -- --save-exact

# Target a different project directory
npx bttrai install ai --project ./my-app

# Scope which extras get installed
npx bttrai install ai --mcp
npx bttrai install ai --skills

# Non-interactive (CI)
npx bttrai install ai --auto --agent cursor

# Open the config file to pin agents or edit presets
npx bttrai config

```

### Commands

| Command          | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `bttrai`         | Default — detect the project stack and install matching extras |
| `bttrai detect`  | Detect matching MCP servers and skills, then install them      |
| `bttrai install` | Install a package and its matching MCP servers + skills        |
| `bttrai config`  | Open the config file (creates it if missing) to pin agents     |

### Options

| Option             | Applies to          | Description                                   |
| ------------------ | ------------------- | --------------------------------------------- |
| `<path>`           | `detect`            | Target a different project directory          |
| `--project <path>` | `install`           | Target a different project directory          |
| `--help`           | all                 | Show command usage and available options      |
| `--list`           | `detect`            | Print matches only, install nothing           |
| `--json`           | `detect`, `install` | Output machine-readable JSON (no execution)   |
| `--auto`           | `detect`, `install` | Skip prompts and auto-select detected matches |
| `--agent <name>`   | `detect`, `install` | Choose one or more agents to install into     |
| `--skills`         | `detect`, `install` | Only include skills                           |
| `--mcp`            | `detect`, `install` | Only include MCP servers                      |

`detect` takes the project directory as a positional argument (`bttrai ./my-app`); `install` takes it as the `--project` flag, since its positional slot holds the package names.

For `bttrai install`, native package-manager flags (`-D`, `--save-exact`, …) must come **after `--`** — everything past `--` is forwarded verbatim to the detected package manager (`npm install`, `bun add`, `pnpm add`, `yarn add`, `deno add npm:`). Tokens **before** `--` are parsed by bttrai, and the package names are read from them to install matching MCP servers + skills.

> [!IMPORTANT]
> `--auto` no longer needs `--agent` — agents resolve automatically (see [Config](#config)). Pass `--agent` only to override the targets for a run. I still wouldn't recommend `--auto` unless you're sure.

## Config

By default agents resolve automatically and **nothing about agents is stored**. You only need a config file if you want to pin a fixed set of agents (or, later, define presets). The file lives in your OS user config dir:

| OS      | Path                                               |
| ------- | -------------------------------------------------- |
| Linux   | `~/.config/bttrai/config.json`                     |
| macOS   | `~/Library/Application Support/bttrai/config.json` |
| Windows | `%APPDATA%\bttrai\config.json`                     |

Set `BTTRAI_CONFIG` to override the path. Run `bttrai config` to open (and lazily create) it.

```jsonc
{
  "autoAgents": true, // resolve agents automatically; `agents` is ignored
  "agents": [], // used only when autoAgents:false — bttrai reads, never writes it
  "editor": "nvim", // optional — editor for `bttrai config` (wins over $EDITOR)
  "presets": {},
}
```

`bttrai config` opens the file in: `editor` from config → `$EDITOR` → the OS default text editor → (failing that) it just prints the path.

Agent resolution order: `--agent` (always wins) → `autoAgents ? auto-detect : agents` → prompt. Pin agents by setting `"autoAgents": false` and listing canonical names (`cursor`, `claude-code`, `github-copilot`, `vscode`) in `agents`. The config is validated on every run; an invalid file stops the run (in a terminal it offers to open / reset / abort, otherwise it prints the errors and exits non-zero).

## Notes

- By default, `bttrai` is intended to install skills and MCPs in your current project/directory.
- Some agents only have global MCP installations, so in those cases the install may need to be global instead of project-level.
- There is partial support for Python projects, but it's not fully implmented.
- If your project prefers `bun`, `pnpm`, `yarn`, or `deno` but that runner is not available, `bttrai` falls back to `npx` automatically.

## Upcoming features

- [ ] Better python support
- [ ] Presets - you can define presets you like, for example a frontend preset with the Shadcn MCP with impeccable and UI/UX pro skill. this would require a global config file for `bttrai`
- [ ] Detect existing MCPs in your agent
- [ ] More languages
- [ ] Maybe a better way to contribute to registries
- [ ] Skills + CLI alternative to MCPs
