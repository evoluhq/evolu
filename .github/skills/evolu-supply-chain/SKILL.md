---
name: evolu-supply-chain
description: "Use when: checking or hardening an app's supply chain, installing or upgrading Evolu packages, verifying that an Evolu release was approved by its maintainer, pinning or verifying the Evolu Relay Docker image, setting a release age or trust policy for npm or pnpm."
argument-hint: "app directory, or an Evolu package version to verify"
---

# Evolu supply chain

## Goal

Check an app that uses Evolu against the practices on
https://www.evolu.dev/docs/supply-chain, verify the Evolu releases it installs,
and propose one fix for each gap. That page is the source of truth: read it
first, and when this skill and the page disagree, follow the page.

Work read-only until the user approves the fixes. Never weaken a release-age,
trust, or install-script setting the app already has.

## 1. Inspect the app

Find the package manager from the lockfile and `packageManager` field. Read the
settings from `pnpm-workspace.yaml` and `.npmrc`, not from `pnpm config get`,
which omits defaults. Report each of these as present, missing, or weaker than
recommended:

- **Versions.** Report the pnpm version in `packageManager`, and the global one
  if it differs, against the minimum each setting needs: pnpm 10.16 for release
  age, 10.21 for the trust policy, 10.22 for its exceptions, and 10.26 for
  `allowBuilds`. In an npm project, npm 11.10 for release age and 11.17 for its
  exceptions.
- **Lockfile.** It is committed, and every install site, such as CI workflows,
  Dockerfiles, and deploy scripts, installs from it, with
  `pnpm install --frozen-lockfile` or `npm ci`. pnpm freezes the lockfile in CI
  by default, so there only `--no-frozen-lockfile` is a gap.
- **Release age.** pnpm: `minimumReleaseAge` in minutes. Without an explicit
  value, pnpm 11 waits 1440 minutes but installs a newer version when no older
  one matches, so report that as weaker; setting it explicitly makes it strict.
  npm: `min-release-age` in the project's `.npmrc`, in days.
- **Trust policy.** pnpm: `trustPolicy: no-downgrade`. Each `trustPolicyExclude`
  entry names one version and should say why.
- **Install scripts.** pnpm 10+ runs them only for the packages allowed in
  `allowBuilds`, or in `onlyBuiltDependencies` before 10.26. pnpm 11 silently
  ignores `onlyBuiltDependencies` and `neverBuiltDependencies`, so report them
  as leftovers there. `@evolu/nodejs` and `@evolu/relay` need
  `better-sqlite3: false`, because its prebuilt binaries need no build. npm:
  `ignore-scripts=true` turns all of them off, the project's own included, so
  mention that before suggesting it.
- **Weakening settings.** Report each of these with its stated reason, or as
  unexplained: `minimumReleaseAgeStrict: false`, every
  `minimumReleaseAgeExclude` entry, `trustPolicyIgnoreAfter`, `trustLockfile`,
  `dangerouslyAllowAllBuilds`, `strictDepBuilds: false`, each `allowBuilds`
  entry set to `true`, and npm's `min-release-age-exclude`.
- **Evolu Relay image.** If the app runs `evoluhq/relay` (Dockerfile, compose
  file, or deployment config), it should reference a digest, not a moving tag
  such as `4` or `latest`. The report says to verify each new image before
  moving the pin, to watch https://github.com/evoluhq/evolu/releases for
  security fixes, and that running `@evolu/relay` from npm, installed from a
  lockfile, puts the relay under the npm approval, which the image's
  attestation doesn't.

Report a check that can't be done, such as one that needs a Git repository or
CI configuration the app doesn't have, as couldn't check.

## 2. Verify the installed Evolu releases

Take each `@evolu/*` package and version from the lockfile's `packages` keys,
without peer suffixes such as `(@evolu/common@8.23.0)`. Get each version's
publish time in UTC with:

```bash
npm view @evolu/<package> 'time[<version>]'
```

Then, for every version:

```bash
npm view @evolu/<package>@<version> _npmUser dist.attestations --json
```

Each must name GitHub Actions as `_npmUser.name` and have
`dist.attestations.provenance`. A version published at or after
2026-10-15T00:00Z must also name `steida` as `_npmUser.approver.name`. If
`_npmUser` prints as a `name <email>` string, it has no approver, which only
versions published before then may lack. Report any version that fails as a
suspected compromise, and tell the user to follow
https://github.com/evoluhq/evolu/security/policy instead of opening a public
issue. For an older version, propose upgrading to the newest approved one once
it is older than the app's release age.

Run `pnpm audit signatures` (pnpm 11.1+) or `npm audit signatures`. pnpm checks
only registry signatures; npm also checks provenance.

For the relay image, verify the exact version to pin, the newest `@evolu/relay`
release on https://github.com/evoluhq/evolu/releases, with the GitHub CLI, and
use the digest it prints:

```bash
gh attestation verify oci://docker.io/evoluhq/relay:<version> \
  --repo evoluhq/evolu \
  --signer-workflow evoluhq/evolu/.github/workflows/docker.yaml \
  --source-ref refs/heads/main \
  --format json \
  --jq '.[].verificationResult.statement.subject[] | "\(.name)@sha256:\(.digest.sha256)"'
```

If the app already pins a digest, verify that too, with
`oci://docker.io/evoluhq/relay@sha256:<digest>`. Report a missing or logged-out
GitHub CLI (`gh auth status`) as couldn't check.

## 3. Propose fixes

Give one decided fix per gap, with the exact setting and file, for example:

```text
# pnpm-workspace.yaml
minimumReleaseAge: 1440
trustPolicy: no-downgrade
```

```bash
# npm, in the project's directory; ignore-scripts also turns off the project's own scripts
npm config set min-release-age 1 --location=project
npm config set ignore-scripts true --location=project
```

Apply them only after the user approves. pnpm 11.1.3+ checks the locked versions
against the release age and trust policy at every install, so after applying,
run `pnpm install --frozen-lockfile` and report each version it refuses. After
any install, check `git diff pnpm-workspace.yaml`, or diff it against a copy
saved before the install, because pnpm writes `allowBuilds` placeholders
itself. Ask the user before allowing a package's install scripts or adding a
release-age or trust exception.

## 4. Report

Summarize in a short table: each check, its result, and the fix. List the
verified Evolu versions with their publish time, approver, and provenance, the
relay digest if there is one, and everything that couldn't be checked.
