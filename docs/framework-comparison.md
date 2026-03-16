# trpc-cli vs citty — Code Comparison

Side-by-side implementation of the same CLI using both frameworks.
The CLI: `better-ai detect` and `better-ai install` commands.

---

## 1. Basic Setup & Entry Point

### trpc-cli

```ts
// src/cli.ts
import { initTRPC } from "@trpc/server"
import { createCli } from "trpc-cli"
import { z } from "zod"
import { detectCommand } from "./commands/detect"
import { installCommand } from "./commands/install"

const t = initTRPC.create()

const router = t.router({
  detect: detectCommand(t),
  install: installCommand(t),
})

createCli({ router }).run()
```

### citty

```ts
// src/cli.ts
import { defineCommand, runMain } from "citty"
import { detect } from "./commands/detect"
import { install } from "./commands/install"

const main = defineCommand({
  meta: {
    name: "better-ai",
    version: "1.0.0",
    description: "Auto-install MCP servers and agent skills",
  },
  subCommands: {
    detect,
    install,
  },
})

runMain(main)
```

---

## 2. The `detect` Command

Reads a project's package.json, matches deps against the registry, outputs matched servers.

### trpc-cli

```ts
// src/commands/detect.ts
import { z } from "zod"

export const detectCommand = (t) =>
  t.procedure
    .meta({ description: "Detect stack and match MCP servers" })
    .input(
      z.object({
        project: z
          .string()
          .default(".")
          .describe("Path to project directory"),
        json: z
          .boolean()
          .default(false)
          .describe("Output as JSON"),
      })
    )
    .query(async ({ input }) => {
      const config = await readProjectConfig(input.project)
      const matches = matchRegistry(config)

      if (input.json) {
        console.log(JSON.stringify(matches, null, 2))
      } else {
        console.log(`Found ${matches.length} MCP servers for your stack`)
        for (const m of matches) {
          console.log(`  - ${m.name}: ${m.target}`)
        }
      }

      return matches
    })
```

```bash
better-ai detect
better-ai detect --project ./my-app
better-ai detect --json
```

### citty

```ts
// src/commands/detect.ts
import { defineCommand } from "citty"

export const detect = defineCommand({
  meta: {
    name: "detect",
    description: "Detect stack and match MCP servers",
  },
  args: {
    project: {
      type: "positional",
      default: ".",
      description: "Path to project directory",
    },
    json: {
      type: "boolean",
      default: false,
      description: "Output as JSON",
    },
  },
  run({ args }) {
    const config = await readProjectConfig(args.project)
    const matches = matchRegistry(config)

    if (args.json) {
      console.log(JSON.stringify(matches, null, 2))
    } else {
      console.log(`Found ${matches.length} MCP servers for your stack`)
      for (const m of matches) {
        console.log(`  - ${m.name}: ${m.target}`)
      }
    }
  },
})
```

```bash
better-ai detect
better-ai detect ./my-app
better-ai detect --json
```

---

## 3. The `install` Command

Detects stack, prompts user to select servers, installs them.

### trpc-cli

```ts
// src/commands/install.ts
import { z } from "zod"
import { select, multiselect, confirm } from "@clack/prompts"
import { $ } from "execa"

export const installCommand = (t) =>
  t.procedure
    .meta({ description: "Install MCP servers for your project" })
    .input(
      z.object({
        project: z
          .string()
          .default(".")
          .describe("Path to project directory"),
        auto: z
          .boolean()
          .default(false)
          .describe("Skip prompts, install all recommended"),
        scope: z
          .enum(["project", "global"])
          .default("project")
          .describe("Install scope"),
        dryRun: z
          .boolean()
          .default(false)
          .describe("Show what would be installed"),
        agent: z
          .array(z.string())
          .optional()
          .describe("Target agents"),
      })
    )
    .mutation(async ({ input }) => {
      const config = await readProjectConfig(input.project)
      const matches = matchRegistry(config)

      let selected = matches
      if (!input.auto) {
        selected = await multiselect({
          message: "Select MCP servers to install",
          options: matches.map((m) => ({
            value: m,
            label: m.name,
            hint: m.target,
          })),
          initialValues: matches,
        })
      }

      if (input.dryRun) {
        console.log("Would install:")
        for (const s of selected) console.log(`  - ${s.name}`)
        return
      }

      for (const server of selected) {
        await $`npx add-mcp@latest ${server.target} --name ${server.name} -y`
      }
    })
```

```bash
better-ai install
better-ai install --auto
better-ai install --auto --scope global
better-ai install --dry-run
better-ai install --agent claude-code --agent cursor
```

### citty

```ts
// src/commands/install.ts
import { defineCommand } from "citty"
import { multiselect } from "@clack/prompts"
import { $ } from "execa"

export const install = defineCommand({
  meta: {
    name: "install",
    description: "Install MCP servers for your project",
  },
  args: {
    project: {
      type: "positional",
      default: ".",
      description: "Path to project directory",
    },
    auto: {
      type: "boolean",
      default: false,
      description: "Skip prompts, install all recommended",
    },
    scope: {
      type: "string",
      default: "project",
      description: "Install scope (project or global)",
    },
    dryRun: {
      type: "boolean",
      default: false,
      description: "Show what would be installed",
    },
    agent: {
      type: "string",
      description: "Target agents (comma-separated)",
    },
  },
  async run({ args }) {
    const config = await readProjectConfig(args.project)
    const matches = matchRegistry(config)

    // No built-in validation for scope — manual check
    if (!["project", "global"].includes(args.scope)) {
      console.error(`Invalid scope: ${args.scope}`)
      process.exit(2)
    }

    let selected = matches
    if (!args.auto) {
      selected = await multiselect({
        message: "Select MCP servers to install",
        options: matches.map((m) => ({
          value: m,
          label: m.name,
          hint: m.target,
        })),
        initialValues: matches,
      })
    }

    if (args.dryRun) {
      console.log("Would install:")
      for (const s of selected) console.log(`  - ${s.name}`)
      return
    }

    for (const server of selected) {
      await $`npx add-mcp@latest ${server.target} --name ${server.name} -y`
    }
  },
})
```

```bash
better-ai install
better-ai install --auto
better-ai install --auto --scope global
better-ai install --dry-run
better-ai install --agent claude-code,cursor
```

---

## 4. Middleware / Shared Logic

Every command needs to load the project config first.

### trpc-cli — built-in middleware

```ts
// src/cli.ts
const t = initTRPC
  .context<{ config: ProjectConfig }>()
  .create()

// Runs before every command automatically
const withConfig = t.middleware(async ({ next, input }) => {
  const project = (input as any)?.project ?? "."
  const config = await readProjectConfig(project)
  return next({ ctx: { config } })
})

const configProcedure = t.procedure.use(withConfig)

const router = t.router({
  detect: configProcedure
    .input(z.object({ project: z.string().default("."), json: z.boolean().default(false) }))
    .query(({ ctx, input }) => {
      // ctx.config is already loaded and typed
      const matches = matchRegistry(ctx.config)
      // ...
    }),

  install: configProcedure
    .input(z.object({ project: z.string().default("."), auto: z.boolean().default(false) }))
    .mutation(({ ctx, input }) => {
      // ctx.config available here too — no duplication
      const matches = matchRegistry(ctx.config)
      // ...
    }),
})
```

### citty — manual with setup hook

```ts
// src/commands/install.ts
import { defineCommand } from "citty"

let config: ProjectConfig

export const install = defineCommand({
  args: {
    project: { type: "positional", default: "." },
    auto: { type: "boolean", default: false },
  },
  async setup({ args }) {
    // Runs before run() — citty's lifecycle hook
    config = await readProjectConfig(args.project)
  },
  async run({ args }) {
    // config is loaded, but it's a module-level variable
    // not injected via context like trpc-cli
    const matches = matchRegistry(config)
    // ...
  },
})
```

No shared middleware across commands — each command defines its own `setup()`.
You could extract a helper function, but it's manual wiring:

```ts
// src/utils/with-config.ts
export async function loadConfig(project: string) {
  return readProjectConfig(project)
}

// Every command repeats this
async setup({ args }) {
  config = await loadConfig(args.project)
},
```

---

## 5. Validation

### trpc-cli — zod does everything

```ts
// Validated at parse time, before your code runs
.input(
  z.object({
    scope: z.enum(["project", "global"]).default("project"),
    agent: z.array(z.string()).optional(),
    timeout: z.number().min(1000).max(60000).default(30000),
  })
)

// Invalid input:
// $ better-ai install --scope banana
// Error: Invalid enum value. Expected 'project' | 'global', received 'banana'
```

### citty — manual validation

```ts
// citty args are typed but not validated beyond basic type coercion
args: {
  scope: {
    type: "string",  // accepts any string
    default: "project",
  },
}

// You validate yourself in run()
async run({ args }) {
  if (!["project", "global"].includes(args.scope)) {
    console.error("Invalid scope — must be 'project' or 'global'")
    process.exit(2)
  }
}
```

---

## 6. Auto-Generated Help

### trpc-cli

```bash
$ better-ai install --help
# Usage: better-ai install [options]
#
# Install MCP servers for your project
#
# Options:
#   --project   Path to project directory (default: ".")
#   --auto      Skip prompts, install all recommended (default: false)
#   --scope     Install scope (choices: "project", "global", default: "project")
#   --dry-run   Show what would be installed (default: false)
#   --agent     Target agents
```

Zod `.describe()` strings become help text. Enum values show as `choices`.

### citty

```bash
$ better-ai install --help
# Usage: better-ai install [project] [--auto] [--scope] [--dry-run] [--agent]
#
# Install MCP servers for your project
#
# Arguments:
#   project   Path to project directory (default: ".")
#
# Options:
#   --auto      Skip prompts, install all recommended
#   --scope     Install scope (project or global)
#   --dry-run   Show what would be installed
#   --agent     Target agents (comma-separated)
```

Similar output. citty shows positional args separately.

---

## 7. Multimodal — Same Router as MCP Server

### trpc-cli — yes, for free

```ts
// src/router.ts — define once
export const router = t.router({
  detect: detectCommand(t),
  install: installCommand(t),
})

// src/cli.ts — use as CLI
import { createCli } from "trpc-cli"
createCli({ router }).run()

// src/mcp.ts — use as MCP server (same router!)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
// Wire the same router to MCP tools
```

### citty — no, separate implementation

```ts
// CLI commands and MCP tools are defined differently.
// You'd share the core logic functions but duplicate
// the command/tool definitions.
```

---

## Summary

| | trpc-cli | citty |
|---|---|---|
| **Lines of code** | ~same | ~same |
| **Validation** | Zod handles it all | Manual checks |
| **Middleware** | Built-in, composable | `setup()` per command, no sharing |
| **Type safety** | Zod → full inference | Arg types inferred, no runtime validation |
| **Enum flags** | `z.enum()` with auto error msgs | String + manual check |
| **Array flags** | `z.array()` native | Comma-separated string, split yourself |
| **Multimodal** | Same router for CLI + MCP | Separate implementations |
| **Help text** | Zod `.describe()` | Arg `description` field |
| **Positional args** | Zod schema position | `type: "positional"` |
| **Size** | 9.7 MB (3.6 MB extra over zod) | 60 KB |
| **Mental model** | tRPC procedures + zod | defineCommand + args object |
