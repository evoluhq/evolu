---
name: strict-one-test-tdd
description: "Use when: strict TDD, one-test TDD, TODO test outlines, test-first implementation, red-green review loops, creating Task3-style modules, writing one test before code, waiting for approval before implementation."
argument-hint: "module name or path"
---

# Strict One-Test TDD

## Goal

Use a strict one-test TDD loop where the test names are the specification. For feature work, optionally write TODO test names first so the full behavior outline can be reviewed. After the user approves the TODO outline, convert one TODO into one executable test, prove it fails for the expected reason, wait for approval, then write the minimum implementation and verify it.

## Target Module

Before writing or changing files, identify the target module from the user's request, active file, attached file, or nearby context. If the target module is unclear, ask exactly what module should be created or changed, for example `Task3`, `Task3.ts`, or `packages/common/src/Task3.ts`. If the target module is clear, confirm it briefly and continue.

## Loop

### Optional TODO Outline

Use this phase when developing a feature or when the user asks to see the whole behavior shape first.

1. Propose concise TODO test names that describe the intended behavior.
2. After the user approves the names, write only TODO tests, for example `test.todo("...")` or the local framework equivalent.
3. Do not write executable test bodies or implementation code in this phase.
4. Do not run tests just to prove TODO tests are pending unless the user asks.
5. Stop and wait for the user's approval before converting the first TODO into an executable red test.

### Red-Green Slice

1. Ask the user for one test name and what that test should do.
2. Write exactly one new executable test for that behavior, or convert exactly one approved TODO test into an executable test.
3. Do not write implementation code yet, except for minimal exports or empty files required for the test to compile when the user explicitly wants a new module from scratch. Use the shared `todo` helper from `@evolu/common` for placeholder implementations.
4. Run only the new or affected test with the `runTests` tool.
5. Confirm the test fails for the expected reason. Do not complicate a red test only to avoid a one-time timeout; prefer a direct behavior-shaped test over diagnostic harness code when the timeout happens only during the failing demonstration.
6. Stop and wait for the user's approval of the test.
7. After approval, write the minimum implementation needed for that one test.
8. Run the same focused test again with the `runTests` tool.
9. Check workspace diagnostics for changed files with `get_errors`.
10. If source code was changed, run focused coverage with `runTests` in coverage mode for the changed source file when practical.
11. Stop and wait for the user's approval before asking for the next test.

## Rules

- Never bundle multiple test cases into one loop. One executable test should describe one behavior or scenario; multiple assertions are fine when they prove that same scenario.
- Multiple TODO test names are allowed only in the TODO outline phase; executable tests must still be one at a time.
- Never add extra behavior beyond the approved test.
- Never refactor unrelated code during the red or green step.
- Use the user's exact test name unless it violates the local test style.
- Keep implementation minimal until the user approves broadening it.
- If the red test fails for the wrong reason, fix only the test setup and rerun before asking for approval.
- If the test unexpectedly passes before implementation, stop and explain why.
- Use `todo()` for new placeholder implementations instead of throwing ad hoc errors.
- Preserve existing repository conventions for file placement, imports, naming, and test style.

## Evolu Defaults

For this repository, package source modules usually live in `packages/*/src/` and package tests in `packages/*/test/`. Apps, scripts, and tooling packages follow their local conventions. Use TypeScript only. Prefer Vitest `describe` and `test`, and use the `runTests` tool instead of terminal test commands.
