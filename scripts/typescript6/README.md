# TypeScript 6 consumer check

Evolu is developed and built with TypeScript 7, but its published declarations
support consumers using TypeScript 6. This workspace package checks that
compatibility boundary.

`consumer.mts` imports every published Evolu package entry point. It is compiled
with the `tsc6` executable provided by `@typescript/typescript6`, so unsupported
declaration syntax and broken package type exports fail the check even though
the repository's primary `tsc` executable is TypeScript 7.

The fixture is a separate workspace package so its imports resolve through the
same package exports as consumer code. It is excluded from `scripts/tsconfig.json`
because it consumes built package declarations and therefore must run after the
packages are built.

Run it through the package check:

```sh
pnpm check:packages
```

The fixture uses `skipLibCheck` because one program imports browser, worker,
Node.js, and framework packages whose ambient libraries cannot all be checked
together without conflicts. Consequently, this is a declaration syntax,
package-export, and module-resolution smoke test—not a complete semantic check
of every declaration. Evolu's normal TypeScript 7 typecheck remains responsible
for full semantic checking.
