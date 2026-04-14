## Adding MCPs and Skills 

To add new MCPs and skills you must submit a pull request with the changes to the registry files in `src/registry/`. 
-  For MCPs, edit `src/registry/mcp-servers.ts`.
-  For Skills, edit `src/registry/skills.ts`.

You must also provide proof that the skills and mcps you are adding are legitimate. Please include links, descriptions, proof of ownership e.t.c.


## Code contributions

Please make your best to keep the code DRY and follow the existing patterns.

### Local setup

This project uses `bun`. Install the dependencies with:

```bash
bun install
```
You can then run the project with:
```bash
bun run dev
```
or 

```bash
bun run cli.js
```
Build and run:
```bash
bun run build
bun run dist/cli.js
```

### Project Structure


```text
src/
├── cli.ts                # CLI entry point
├── components/          # Shared CLI UI helpers and output formatting
├── registry/            # Built-in registry data for agents, MCP servers, orgs, and skills
├── services/
│   ├── detector/        # Project stack detection logic
│   ├── install/         # Installation flow and install utilities
│   ├── matcher/         # Matching logic between detected deps and registry entries
│   ├── service.interface.ts
│   └── utils.ts
tests/
├── unit/                # Unit tests
├── e2e/                 # CLI end-to-end tests
├── fixtures/projects/   # Test fixture projects
└── helpers/             # Shared test helpers
scripts/
├── sync-agents.ts       # Registry sync script for agents
└── sync-skills.ts       # Registry sync script for skills

README.md                # Project usage and CLI documentation
package.json             # Package metadata and scripts
tsconfig.json            # TypeScript configuration
.oxlintrc.json           # Lint configuration
.oxfmtrc.json           # Format configuration
```

This project uses a small set of tools that make CLI development simpler and easier to maintain:

- `trpc-cli` and `@trpc/server` provide a typed command interface, which makes it easier to define commands and inputs safely.
- `@clack/prompts` provides interactive CLI prompts with a cleaner developer experience than building prompt flows manually.
- `execa` simplifies running subprocesses for installs and external tooling in a more reliable way than raw shell calls.


### Useful commands

```bash
bun run dev
bun run build
bun run lint
bun run fmt:check
bun run test
```