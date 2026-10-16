# Developing Evolu Relay

Run these commands from the repository root.

## Release

`@evolu/relay` is versioned by Changesets and staged on npm like every other
package, and npm publishes it once a maintainer approves it. Each successful
Release run on main starts the Docker workflow. When Docker Hub lacks the image
of that run's relay version, it checks every 30 seconds, for up to 330 minutes,
whether npm serves that exact version, so the image follows a prompt approval
within minutes. Such runs watch one at a time, and only the newest waiting one
is kept. An hourly run checks main's relay version once, which picks up a later
approval. Then the push job builds the image from the npm package, pushes it
with the Docker Hub token of its `docker-hub` environment, signs it, and moves
its tags. A push that fails before the version tag exists is retried by the next
hourly run; after that, run the Docker workflow on main, which repairs the other
tags. To push sooner, run the Docker workflow on main; if npm doesn't serve the
version yet, the run pushes nothing. A version that main has moved past gets no
image if no watch saw npm serve it, unless all jobs of its Release run's Docker
run are rerun, which pushes only its version tag. GitHub disables scheduled
workflows after 60 days without repository activity, so after such a pause,
enable the Docker workflow again. The push job checks Docker Hub on every
attempt, including reruns of only a failed job. A manual run whose image already
exists reuses its digest and repairs tags without rebuilding or signing it.
Reruns of older runs leave the current release's stable aliases unchanged. A
base image update, such as one from Dependabot, reaches users only with a new
relay version, so add a patch changeset for `@evolu/relay` to its pull request.

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
