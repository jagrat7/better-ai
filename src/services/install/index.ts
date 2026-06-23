import { detectInstallService } from "./detect-install"
import { packageInstallService } from "./package-install"
import { presetInstallService } from "./preset-install"
import type { InstallDispatchInput } from "./types"

// Single entry point for the install flows. Switches on `type`:
//   - "detect": detect the project stack and install matching extras
//   - "package": install the named package(s) and their matching extras
//   - "preset": install a named config preset's extras (no detection)
export async function install(input: InstallDispatchInput): Promise<void> {
  switch (input.type) {
    case "detect": {
      const { type: _type, ...rest } = input
      const result = await detectInstallService.run({
        ...rest,
        auto: rest.auto ?? rest.json ?? false,
      })

      if (rest.json) {
        console.log(JSON.stringify(detectInstallService.json(result), null, 2))
        return
      }

      await detectInstallService.command(result)
      return
    }
    case "package": {
      const { type: _type, ...rest } = input
      await packageInstallService.run(rest)
      return
    }
    case "preset": {
      const { type: _type, ...rest } = input
      const result = await presetInstallService.run({
        ...rest,
        auto: rest.auto ?? rest.json ?? false,
      })

      if (rest.json) {
        console.log(JSON.stringify(presetInstallService.json(result), null, 2))
        return
      }

      await presetInstallService.command(result)
      return
    }
  }
}
