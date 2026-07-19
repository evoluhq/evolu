---
applyTo: "**/*"
---

# GitHub Copilot guidance

Read and follow the repository-wide instructions in [AGENTS.md](../AGENTS.md).

## VS Code-specific verification

- Use the `runTests` tool for focused tests when available. Its `testNames`
  parameter uses substring matching, so use a unique test name. Otherwise, run
  the focused Vitest command documented in `AGENTS.md`.
- After edits, use `get_errors` to check workspace diagnostics for changed files.
- Monorepo type changes can leave ESLint’s TypeScript cache stale and produce
  spurious unsafe-call, unsafe-member-access, or unsafe-assignment diagnostics.
  When that happens, run the `eslint.restart` VS Code command through
  `run_vscode_command`, then check diagnostics again.
- Use the repository commands from `AGENTS.md` when a VS Code-specific tool is
  unavailable or when broader verification is required.
