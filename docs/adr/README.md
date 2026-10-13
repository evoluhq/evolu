# Architecture decision records

An architecture decision record (ADR) is a short document that records one
significant decision: the context that forced it, what was decided, the
alternatives considered, and the consequences. This summary follows Martin
Fowler's
[Architecture Decision Record](https://martinfowler.com/bliki/ArchitectureDecisionRecord.html);
Michael Nygard coined the term in 2011.

An ADR serves two purposes. It tells future readers, possibly years later, why
the code is the way it is. Writing it also clarifies thinking: putting a
decision into words brings disagreements into the open while they can still be
resolved.

- **Short.** One or two pages at most, with the most important information
  first. Link supporting material instead of copying it.
- **One decision per file.** Fowler starts each file name with a sequence
  number. Evolu names a file only after its title, because parallel agent
  sessions would pick the same next number, and renumbering would break the
  paths that code points to.
- **Never rewritten once decided.** An accepted or rejected ADR changes only to
  fix typos and links or to be marked superseded. When a decision changes, a new
  ADR supersedes it, and the old one links to the new one, so the log shows
  which decision governed the code and for how long.
- **Honest about trade-offs.** It lists the serious alternatives and why they
  lost, the consequences, and what would make us revisit the decision.

As in Fowler's description, a new ADR is Proposed: contributors and agents can
read the design before it is decided, and it is revised until a maintainer
accepts or rejects it. Only an Accepted ADR binds the code. Unlike Fowler,
Evolu keeps Rejected ADRs, so a rejected idea is not proposed again.

[Conventions](https://www.evolu.dev/docs/conventions#decision-records) describe
when Evolu writes an ADR and how code points to one. Start a new ADR from
[template.md](template.md).
