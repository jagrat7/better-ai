#!/usr/bin/env node
import pkg from "../package.json"
import { initTRPC } from "@trpc/server"
import { createCli, type TrpcCliMeta } from "trpc-cli"
import { z } from "zod"
import { resolve } from "path"
import { detect } from "./services/detect"
import { install, installService } from "./services/install"
import { renderHeader } from "./components/header"

const t = initTRPC.meta<TrpcCliMeta>().create()

const procedure = t.procedure.use(async ({ getRawInput, next }) => {
  const opts = (await getRawInput()) as Record<string, unknown> | undefined
  if (opts && !opts.json && !process.stdout.isTTY) {
    opts.json = true
  }
  if (process.stdout.isTTY && !opts?.json) {
    console.error(renderHeader())
  }
  return next()
})

// Options shared by `detect` and `install`. Each command extends this with its
// own positional and command-specific flags.
const baseOptions = z.object({
  project: z.string().optional().describe("Path to project directory"),
  json: z.boolean().optional().describe("Output as JSON"),
  auto: z.boolean().optional().describe("Auto-approve installation"),
  agent: z
    .array(z.string())
    .optional()
    .describe("Agents to install to (e.g. cursor, claude-code)"),
  skills: z.boolean().optional().describe("Include only skills in installation"),
  mcp: z.boolean().optional().describe("Include only MCP servers in installation"),
})

const router = t.router({
  detect: procedure
    .meta({
      description: "Detect project stack and install matching MCP servers + skills",
      default: true,
    })
    .input(
      baseOptions.extend({
        // detect takes the project as a positional; install keeps it as a flag
        // (its positional is `packages`).
        project: baseOptions.shape.project.meta({ positional: true }),
        list: z.boolean().optional().describe("Print matches only, install nothing"),
      }),
    )
    .mutation(async ({ input }) => {
      const project = resolve(input.project ?? ".")
      // Read-only modes: --list always prints, --json without --auto prints matches
      // without executing. Both skip the interactive install flow entirely.
      if (input.list || (input.json && !input.auto)) {
        await detect({ project, json: input.json })
        return
      }
      await install({
        project,
        json: input.json,
        auto: input.auto,
        agent: input.agent,
        skills: input.skills,
        mcp: input.mcp,
      })
    }),
  install: procedure
    .meta({
      description:
        "Install package(s) and matching MCP servers + skills. Pass native package-manager flags (e.g. -D) after `--`.",
    })
    .input(
      baseOptions.extend({
        packages: z
          .array(z.string())
          .optional()
          .describe("Packages to install; tokens after `--` are forwarded to the package manager")
          .meta({ positional: true }),
        auto: z.boolean().optional().describe("Auto-approve installation (requires --agent)"),
      }),
    )
    .mutation(async ({ input }) => {
      await installService.installForPackages({
        project: resolve(input.project ?? "."),
        rawArgs: input.packages ?? [],
        mcp: input.mcp,
        skills: input.skills,
        agent: input.agent,
        auto: input.auto,
        json: input.json,
      })
    }),
})

const cli = createCli({
  router,
  name: pkg.name,
  version: pkg.version,
})

cli.run()
