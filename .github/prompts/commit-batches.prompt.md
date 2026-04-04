---
name: commit-batches
description: Suggest commit batches from current changes and process them one by one with approvals.
---

Workflow:

1. Inspect the current git state using status and diffs.
2. Review the changed files before proposing any batches.
3. Suggest commit batches grouped by intent only.
4. Do not list files when proposing batches.
5. Present batches as features, fixes, refactors, or other coherent changes.
6. Wait for my approval of the proposed batches or for instructions to revise them.
7. When batches are approved, take the first approved batch and propose:
   - Files to include in that batch
   - Commit summary (sentence case, no prefix, under 50 characters)
   - Commit description
8. Wait for explicit approval before committing anything.
9. After approval, commit only the files for that batch.
10. Continue with the next approved batch and repeat from step 7.

Rules:

- Never commit anything before explicit approval.
- Base the initial batch proposal on git status and diff review, not only file names.
- If I ask to regroup, split, merge, reorder, or rename batches, revise the batch proposal and wait again.
- Keep the initial batch proposal high level and concise.
- When proposing a concrete batch for commit, include only the files that belong to that approved intent.
