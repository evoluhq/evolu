---
name: commit-batches
description: Suggest commit batches from current changes and process them one by one with approvals.
---

Workflow:

1. Inspect the current git state using status and diffs.
2. Review the changed files before proposing any batches.
3. Review existing unreleased Changesets against the current implementation and identify entries that are obsolete, inaccurate, duplicated, or superseded.
4. Suggest commit batches grouped by intent only.
5. Do not list files when proposing batches.
6. Present batches as features, fixes, refactors, or other coherent changes.
7. Wait for my approval of the proposed batches or for instructions to revise them.
8. When batches are approved, take the first approved batch and propose:
   - Files to include in that batch
   - Commit summary (sentence case, no prefix, under 50 characters)
   - Commit description
   - Whether a Changeset is required and why
   - For a required Changeset, the affected packages, version bumps, and release note in past tense
   - Existing Changesets to keep, update, merge, replace, or remove, with reasons
   - Focused validation to run before committing
9. Wait for explicit approval before creating, updating, merging, replacing, or removing a Changeset; staging changes; or committing anything.
10. After approval, apply the approved Changeset plan.
11. Stage only the approved files, including the Changeset.
12. Review the complete staged diff and verify that it contains exactly the approved batch. If it contains unrelated or missing changes, stop and report the mismatch without committing.
13. Run the proposed focused validation. If validation fails, stop and report the failure without committing.
14. Commit the approved staged changes, confirm the resulting git status, then continue with the next approved batch and repeat from step 8.

Rules:

- Never commit anything before explicit approval.
- Base the initial batch proposal on git status and diff review, not only file names.
- Detect existing staged changes before proposing batches. Never unstage, overwrite, or include them in a commit without explicit approval.
- If I ask to regroup, split, merge, reorder, or rename batches, revise the batch proposal and wait again.
- Keep the initial batch proposal high level and concise.
- Keep each commit independently coherent. Order batches so intermediate commits remain valid whenever possible, and disclose dependencies between batches.
- When proposing a concrete batch for commit, include only the files that belong to that approved intent.
- Include a Changeset in the same commit for changes to published packages unless the repository configuration excludes the package or the change does not affect consumers. Explicitly explain when no Changeset is needed.
- Treat unreleased Changesets as provisional during the preview phase. Update, merge, replace, or remove them when they no longer describe the current public behavior accurately.
- Do not preserve an obsolete Changeset merely because it predates the current changes.
- Follow the repository's Changeset conventions and use past tense.
- Never use broad staging commands that can include unrelated changes.
- Never amend, squash, reorder, or otherwise rewrite existing commits unless explicitly requested.
