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

As I was building this, I hope this project will provide a way to **democratize** and **standardize** development with AI. Rather than leaning on a hand-maintained list, `bttrai` runs an exhaustive, freshest-source-first search for the skills your dependencies actually ship. Check out the [contributing guide](.github/CONTRIBUTING.md) for more info.

For each dependency, `bttrai` runs a freshest-source-first search — a local `node_modules` scan, then live repo discovery (npm `repository` field and GitHub search), then registry-pinned GitHub fetches, falling back to the hand-maintained registry only when GitHub is unavailable. MCP servers are matched directly against the static registry by your project's dependencies.

## Usage

### `detect` — scan a project and install matches

The default command. Detects your stack and installs every matching MCP server + skill.

```bash
# Detect and install matches in the current directory
npx bttrai

# Run against a different project directory
npx bttrai ./my-app

# Auto-approve — agents resolve automatically (no --agent needed)
npx bttrai --auto

# ...or pin specific agents for this run
npx bttrai --auto --agent cursor claude-code

# Scope which extras get installed
npx bttrai --skills
npx bttrai --mcp

# Print matches without installing anything
npx bttrai detect --list

# Output JSON for scripts/automation (no execution)
npx bttrai detect --json
```

### `install` — add a package and its matching extras

Installs the named package(s) with your project's package manager, then the MCP servers + skills that match them.

```bash
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
```

### `preset` — install a named bundle (no detection)

Installs only the MCP servers + skills defined in a [preset](#presets) — no stack detection runs.

```bash
npx bttrai preset frontend
```

### `config` — manage the config file

```bash
# Open the config file to pin agents or edit presets
npx bttrai config
```

### Commands

| Command                | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `bttrai`               | Default — detect the project stack and install matching extras |
| `bttrai detect`        | Detect matching MCP servers and skills, then install them      |
| `bttrai install`       | Install a package and its matching MCP servers + skills        |
| `bttrai preset <name>` | Install a named preset's MCP servers + skills (no detection)   |
| `bttrai config`        | Open the config file (creates it if missing) to pin agents     |

### Options

| Option             | Applies to                    | Description                                   |
| ------------------ | ----------------------------- | --------------------------------------------- |
| `<path>`           | `detect`                      | Target a different project directory          |
| `<name>`           | `preset`                      | Name of a preset defined in config            |
| `--project <path>` | `install`                     | Target a different project directory          |
| `--help`           | all                           | Show command usage and available options      |
| `--list`           | `detect`                      | Print matches only, install nothing           |
| `--json`           | `detect`, `install`, `preset` | Output machine-readable JSON (no execution)   |
| `--auto`           | `detect`, `install`, `preset` | Skip prompts and auto-select detected matches |
| `--agent <name>`   | `detect`, `install`, `preset` | Choose one or more agents to install into     |
| `--skills`         | `detect`, `install`, `preset` | Only include skills                           |
| `--mcp`            | `detect`, `install`, `preset` | Only include MCP servers                      |

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
  "presets": {
    "frontend": {
      // registry keys/names, OR raw entries (see Presets below)
      "mcp": ["context7", "shadcn", "https://mcp.sentry.dev/mcp"],
      "skills": ["ai-sdk", "neondatabase/agent-skills#neon-auth"],
    },
  },
}
```

`bttrai config` opens the file in: `editor` from config → `$EDITOR` → the OS default text editor → (failing that) it just prints the path.

Agent resolution order: `--agent` (always wins) → `autoAgents ? auto-detect : agents` → prompt. Pin agents by setting `"autoAgents": false` and listing canonical names (`cursor`, `claude-code`, `github-copilot`, `vscode`) in `agents`. The config is validated on every run; an invalid file stops the run (in a terminal it offers to open / reset / abort, otherwise it prints the errors and exits non-zero).

### Presets

Presets are reusable bundles of MCP servers + skills defined under `presets` in the config. `bttrai preset <name>` installs **only** that preset's extras — no detection runs. Presets do **not** contain agents — those resolve normally. It honors `--auto`, `--agent`, `--skills`, and `--mcp`; an unknown preset name fails with a friendly error listing the available presets.

Each `mcp`/`skills` entry is either a **registry reference** or a **raw entry** used verbatim:

| Field    | Registry reference        | Raw entry                                                                 |
| -------- | ------------------------- | ------------------------------------------------------------------------- |
| `mcp`    | a registry key (`shadcn`) | a target URL or command (`https://mcp.sentry.dev/mcp`, `npx -y some-mcp`) |
| `skills` | a skill name (`ai-sdk`)   | a source repo with explicit skills (`owner/repo#skill-a,skill-b`)         |

A raw `mcp` URL infers its transport (`http`, or `sse` for a `/sse` endpoint) and a name from the host; a raw `skills` source **must** name the skills to install from it (`#skill-a,skill-b`). Registry references are validated against the registry on load; raw entries only need valid shape.

## Notes

- By default, `bttrai` is intended to install skills and MCPs in your current project/directory.
- Some agents only have global MCP installations, so in those cases the install may need to be global instead of project-level.
- There is partial support for Python projects, but it's not fully implmented.
- If your project prefers `bun`, `pnpm`, `yarn`, or `deno` but that runner is not available, `bttrai` falls back to `npx` automatically.

## Upcoming features

- [ ] Better python support
- [x] Presets - you can define presets you like, for example a frontend preset with the Shadcn MCP with impeccable and UI/UX pro skill. this would require a global config file for `bttrai`
- [ ] Detect existing MCPs in your agent
- [ ] More languages
- [ ] Maybe a better way to contribute to registries
- [ ] Skills + CLI alternative to MCPs
