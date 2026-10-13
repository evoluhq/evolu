# Record architecture decisions

- Date: 2026-10-13
- Status: Accepted

## Context

Evolu documents behavior and constraints in module JSDoc, the reason for a
specific piece of code in a `//` comment at that code, coding rules in
[Conventions](https://www.evolu.dev/docs/conventions), and released changes in
changesets. Decisions that no single code site owns, such as why sync uses
WebSocket and not WebTransport, or why the relay's Docker image installs the
published npm package instead of a bundle, had no place. Their reasons, and
designs still under discussion, lived in maintainers' private notes and AI
agent memory, so contributors and new agent sessions could not see them, and
rejected alternatives kept being proposed again.

## Decision

Record such decisions as architecture decision records in `docs/adr`, as the
[README](README.md) describes and following
[Conventions](https://www.evolu.dev/docs/conventions#decision-records). An ADR
is one or two pages at most and is named after its title. It starts as
Proposed, so others can read a design before it is decided. A maintainer
accepts or rejects it: an accepted ADR binds and is superseded rather than
rewritten, and a rejected one stays so the idea is not proposed again. Code
that a decision governs points to its accepted ADR in a comment, and a test
checks that ADRs follow the template and that every reference to one resolves.

## Rejected alternatives

- Private notes and agent memory: other contributors and tools cannot read them.
- Proposals in issues, such as the Evolu Enhancement Proposal issue template:
  they live outside the repository, where agents rarely look, and the template
  was used three times before it was removed.
- Design notes in `notes/`: they grew long, mixed decided and open questions,
  and went stale; the clock-drift note was replaced by module JSDoc.
- The full MADR template or tools such as adr-tools: more fields and process
  than a few short records need.
- Numbered file names: parallel agent sessions pick the same next number, and
  renumbering a record breaks the paths that code points to.
- Publishing ADRs on evolu.dev: they are read in the repository, next to the
  code they govern, and the Conventions page links the folder.

## Consequences

Contributors and agents find the reason for a decision at the code they change,
and designs under discussion before they are decided, while module JSDoc and
`//` comments keep their roles. Decisions that live only in private notes have
to be written down as they come up. Revisit this if ADRs start restating module
docs, proposals linger undecided, or ADRs are no longer read.
