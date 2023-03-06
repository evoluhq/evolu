---
"evolu": major
---

Evolu 2.0

- Zod replaced with effect-ts/schema.
- Types are more strict, readable, fast, reusable, and descriptive for the domain model. We also simplified type hints in IDEs.
- The `mutate` function was replaced with the `create` and `update` functions.
- We removed internals from public API.
- Evolu enforces the useQuery `filterMap` helper usage because it's super-useful.

We removed internals from public API because exporting all under the same namespace wasn't ideal for DX. If necessary, we will reexport them but namespaced. If you already have an app made with Evolu, the only breaking changes are in the API; the persistence remains the same.

We replaced Zod with Schema because Schema is fantastic and going to be even better. Let me explain it. There are several well-established runtime type checkers in the TypeScript ecosystem. The best was io-ts from Giulio Canti, but during its further development, Giulio hit the wall of architectural design. After a few attempts, it looked like he had given up. Then Zod was created to continue the mission of the best runtime types checker. That's why Evolu chose Zod. Zod is good. But several months ago, Giulio Canti restarted its open-source work and joined his endeavor with the Effect team to work full-time on Schema and other awesome libs. While fresh new, Schema is already very powerful and faster than Zod. It's also very well documented. Evolu has big plans with type-driven development, and Schema is ideal.

Switching to Schema allowed us to improve Evolu DX by making types more strict, readable, fast, reusable, and descriptive for the domain model. Before this change, every column except for Id was nullable. Evolu 2.0 makes nullability explicit and optional. That's why the `mutate` function was refactored to the `create` and `update` functions. The `create` function enforces non-nullable columns now. To leverage this feature, use TypeScript 4.7 or newer with strict and exactOptionalPropertyTypes flags enabled in your tsconfig.json file.

The last change is that Evolu enforces useQuery `filterMap` usage. While Evolu enforces creating new rows with the desired Schema, it can't enforce the order of messages from other devices. That's a rule in distributed systems and local-first software: messages can and will come in any order. Also, local-first apps have to handle all schema versions gracefully. That's what `filterMap` is for.
