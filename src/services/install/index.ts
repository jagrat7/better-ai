import { detectInstallService } from "./detect-install"
import { packageInstallService } from "./package-install"
import type { InstallDispatchInput } from "./types"

// Single entry point for both install flows. Switches on `type`:
//   - "detect": detect the project stack and install matching extras
//   - "package": install the named package(s) and their matching extras
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
  }
}
