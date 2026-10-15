# Developing Evolu Relay

Run these commands from the repository root.

## Release

`@evolu/relay` is versioned by Changesets and staged on npm like every other
package, and npm publishes it once a maintainer approves it. Each successful
Release run on main starts the Docker workflow; after a failed one, rerun its
failed jobs or run the Docker workflow on main. When Docker Hub lacks the image,
its push job asks the maintainer to approve its `docker-hub` deployment, which
holds the Docker Hub token: approve the npm release first. The job then waits up
to 15 minutes for npm to serve that exact package version and installs it. If
the npm approval comes later, rerun the job. It checks Docker Hub on every
attempt, including reruns of only a failed job. If its image already exists,
the workflow reuses its digest and repairs tags without rebuilding or signing
it. Reruns of older releases leave the current release's stable aliases
unchanged.

GitHub build provenance is generated only for an image built by that job,
before repairing tags. A retry does not repair missing provenance for an
existing image. Recover it only from the original build evidence or an existing
signed attestation bundle; the registry digest alone does not prove how the
image was built.

## Verify an unpublished image

Build and pack the relay, then pass the resulting tarball to Docker:

```bash
pnpm build
pnpm --dir apps/relay pack
docker build --build-arg RELAY_PACKAGE=./evolu-relay-4.0.0.tgz -t evolu/relay:dev apps/relay
docker run --rm -p 4000:4000 -v evolu-relay-dev:/app/data evolu/relay:dev
```

Replace `evolu-relay-4.0.0.tgz` with the filename printed by `pnpm pack`.
The tarball installs its `@evolu/common` and `@evolu/nodejs` dependencies from npm.
This only verifies relay-only changes against published dependencies; changes
to those packages must also be available before testing the complete image.

Verify a custom port with:

```bash
docker run --rm -e PORT=4001 -p 4001:4001 -v evolu-relay-dev:/app/data evolu/relay:dev
```

The container should become healthy and store its database under `/app/data`.
