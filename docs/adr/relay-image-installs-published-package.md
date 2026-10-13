# The relay image installs the published npm package

- Date: 2026-09-03
- Status: Accepted

## Context

`@evolu/relay` is a Node.js server that depends on `@evolu/common` and
`@evolu/nodejs` from this workspace. It is released by Changesets like every
other package and also shipped as a Docker image. The image has to run exactly
the code that was released, and the relay has to be released whenever code it
depends on changes.

## Decision

`@evolu/relay` is an unbundled npm package: `tsc` builds it, and
`@evolu/common` and `@evolu/nodejs` are runtime `dependencies`. The
[Dockerfile](../../apps/relay/Dockerfile) runs `npm install --global` of the
published package. The release workflow builds the image after npm publication
and waits until npm serves that version. Unpublished relay changes are verified
by passing a packed tarball, as
[CONTRIBUTING.md](../../apps/relay/CONTRIBUTING.md) describes.

## Rejected alternatives

- Bundling the relay: the bundled packages had to move to `devDependencies`,
  and Changesets gives devDependents no version bump, so the relay would not be
  released when the code it bundled changed. It also needed a launcher and a
  third-party license file.
- Building the image from the workspace with `pnpm deploy`: it ignores
  `publishConfig`, so `src/*.ts` exports land under `node_modules`, where
  Node.js refuses to strip types. Its `--prod` mode also drops the link
  `@evolu/nodejs` uses for its `@evolu/common` peer.
- Installing a filtered workspace inside the image: the hoisted linker installs
  every project's dependencies regardless of `--filter`, and `@evolu/relay...`
  also selects the lint and TypeScript config packages.

## Consequences

The image always matches the npm release, and the relay is released whenever
its dependencies are. An image can only be built after its packages are
published, so a relay change that needs unreleased `@evolu/common` or
`@evolu/nodejs` changes cannot be tested as a complete image until those are on
npm. Revisit this if the relay stops being a Node.js package.
