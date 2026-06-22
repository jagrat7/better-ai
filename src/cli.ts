#!/usr/bin/env node
import pkg from "../package.json"
import { initTRPC } from "@trpc/server"
import { createCli, type TrpcCliMeta } from "trpc-cli"
import { z } from "zod"
import pc from "picocolors"
import { resolve } from "path"
import { detect } from "./services/detect"
import { install } from "./services/install"
import { configService } from "./services/config"
import { installOptions } from "./services/install/types"
import { hoistInstallFlags } from "./services/install/utils"
import { assertProjectExists } from "./services/shared/utils"
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
  try {
    await assertProjectExists(
      resolve(
        (opts?.project as string | undefined) ?? (opts?.path as string | undefined) ?? ".",
      ),
    )
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)))
    process.exit(1)
  }
  return next()
})


const router = t.router({
  detect: procedure
    .meta({
      description: "Detect project stack and install matching MCP servers + skills",
      default: true,
    })
    .input(
      installOptions.extend({
        // detect accepts the project positionally (`path`) or via the inherited
        // `--project` flag; the flag wins when both are given. install keeps
        // `project` as a flag and uses `packages` for its positional.
        path: installOptions.shape.project.meta({ positional: true }),
        list: z.boolean().optional().describe("Print matches only, install nothing"),
      }),
    )
    .mutation(async ({ input }) => {
      const project = resolve(input.project ?? input.path ?? ".")
      // Read-only modes: --list always prints, --json without --auto prints matches
      // without executing. Both skip the interactive install flow entirely.
      if (input.list || (input.json && !input.auto)) {
        await detect({ project, json: input.json })
        return
      }
      await install({
        type: "detect",
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
      installOptions.extend({
        packages: z
          .array(z.string())
          .optional()
          .describe("Packages to install; tokens after `--` are forwarded to the package manager")
          .meta({ positional: true }),
        auto: z.boolean().optional().describe("Auto-approve installation"),
      }),
    )
    .mutation(async ({ input }) => {
      // Hoist any bttrai flags the user placed after `--` (a common mistake) so
      // they take effect regardless of position; forward only the rest to the
      // package manager. Flags parsed before `--` still win when both are set.
      const hoisted = hoistInstallFlags(input.packages ?? [])
      const project = resolve(input.project ?? hoisted.project ?? ".")
      await assertProjectExists(project)
      await install({
        type: "package",
        project,
        rawArgs: hoisted.rest,
        mcp: input.mcp ?? hoisted.mcp,
        skills: input.skills ?? hoisted.skills,
        agent: input.agent ?? hoisted.agent,
        auto: input.auto ?? hoisted.auto,
        json: input.json ?? hoisted.json,
      })
    }),
  // No project-assert middleware: `bttrai config` operates on the user config
  // file, not a project directory.
  config: t.procedure
    .meta({ description: "Open the bttrai config file (creates it if missing)" })
    .input(z.object({ json: z.boolean().optional().describe("Print the config path as JSON") }))
    .mutation(async ({ input }) => {
      const result = await configService.run({ json: input.json })
      if (input.json) {
        console.log(JSON.stringify(configService.json(result), null, 2))
        return
      }
      if (!process.stdout.isTTY) {
        console.log(result.path)
        return
      }
      await configService.command(result)
    }),
})

const cli = createCli({
  router,
  name: pkg.name,
  version: pkg.version,
})

cli.run()
