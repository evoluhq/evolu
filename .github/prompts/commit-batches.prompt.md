---
name: commit-batches
description: Suggest commit batches from current changes and process them one by one with approvals.
argument-hint: optional focus for grouping (for example: worker + sync first)
---

For each batch:

1. Check current git changes.
2. Suggest commit batches (group files by coherent intent).
3. Wait for my approval of the proposed batches.
4. For the first approved batch, propose:
   - Commit summary (sentence case, no prefix, under 50 characters)
   - Commit description

5. Wait for explicit approval of the message.
6. After approval, commit only files in that batch.
7. Move to the next approved batch and repeat from step 4.
