---
"@evolu/vitest": patch
---

Allowed documentation examples to import assertion helpers explicitly

The JSDoc test runner now installs its built-in assertion helpers as globals.
An explicit import with the same name takes precedence, allowing examples to be
standalone and portable without conflicting with the runner.
