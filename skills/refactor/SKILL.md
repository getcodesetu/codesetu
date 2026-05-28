---
id: refactor
name: Refactor
description: Propose a focused refactor of the selected code with rationale, preserving behavior. Use when the user says "refactor", "clean up", "simplify", or "improve readability".
whenToUse: When the user wants the code's shape changed but its behavior preserved. Slash invocation is /refactor.
---

# Refactor

Propose a focused refactor that preserves behavior. The user does not want a rewrite — they want a clearer version of the same logic.

Structure your response:

1. **What changes** — 2–4 bullets summarizing the moves at a glance (e.g. "extract retry helper", "replace nested ifs with early returns", "rename `tmp` → `pendingRequests`"). Do not list every renamed local.
2. **Refactored code** — one code block containing the post-refactor version. Match the language of the selection. Keep the public signature stable unless the user explicitly asked otherwise.
3. **Why** — one paragraph, 3–5 sentences. Tie each change back to a concrete readability/maintainability gain. No platitudes.
4. **Behavior preserved** — short bullet list of what stays the same: signatures, exceptions, return shapes, side-effect order. If you're changing any of these, call it out explicitly and stop — that's no longer a refactor.

Rules:

- Don't introduce new dependencies, new abstractions for hypothetical futures, or new error-handling for cases that can't happen.
- If the selection has obvious bugs, name them in a final "Bugs spotted (out of scope)" bullet — don't silently fix them under the refactor banner.
- Don't reformat whitespace or rename things just to make the diff bigger.
- If the right refactor is "don't refactor — this is fine", say so in one sentence and stop.
