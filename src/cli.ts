#!/usr/bin/env node
import pkg from "../package.json"
import { initTRPC } from "@trpc/server"
import { createCli, type TrpcCliMeta } from "trpc-cli"
import { z } from "zod"
import { resolve } from "path"
import { detect } from "./commands/detect"

const t = initTRPC.meta<TrpcCliMeta>().create()

const router = t.router({
  detect: t.procedure
    .meta({ description: "Detect project stack and matching MCP servers + skills", default: true })
    .input(
      z.object({
        project: z.string().optional().describe("Path to project directory"),
        json: z.boolean().optional().describe("Output as JSON"),
      })
    )
    .mutation(async ({ input }) => {
      await detect({
        project: resolve(input.project ?? "."),
        json: input.json,
      })
    }),
})

createCli({
  router,
  name: pkg.name,
  version: pkg.version,
}).run()
