#!/usr/bin/env node
import pkg from "../package.json"
import { initTRPC } from "@trpc/server"
import { createCli, type TrpcCliMeta } from "trpc-cli"
import { z } from "zod"
import { intro, outro, text } from "@clack/prompts"
import { handleCancel } from "./utils/prompts"
import { $ } from "execa"
import pc from "picocolors"

const t = initTRPC.meta<TrpcCliMeta>().create()

const router = t.router({
  hello: t.procedure
    .meta({ description: "Say hello", default: true })
    .input(
      z.object({
        name: z.string().optional().describe("Your name"),
      })
    )
    .mutation(async ({ input }) => {
      // @clack/prompts
      intro(pc.bgCyan(" better-ai "))

      let name = input.name
      if (!name) {
        name = handleCancel(await text({
          message: "What is your name?",
          placeholder: "world",
        })) || "world"
      }

      // picocolors
      console.log(pc.green(`Hello, ${name}!`))

      // execa
      const { stdout } = await $`echo ${"echo from execa: " + name}`
      console.log(pc.dim(stdout))

      // zod validated
      console.log(pc.dim(`(validated by zod: ${typeof name === "string" ? "ok" : "fail"})`))

      outro(pc.green("Done!"))
    }),
  bye: t.procedure
    .meta({ description: "Say bye" })
    .query(async () => {
      outro(pc.magenta("Bye looser!"))
    }),
})

createCli({
  router,
  name: pkg.name,
  version: pkg.version,
}).run()
