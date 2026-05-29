---
id: explain-code
name: Explain Code
description: Produce a structured explanation of selected code or the active file. Use when the user asks "what does this do" or "explain this".
whenToUse: When the user wants to understand existing code — their selection, the active file, or a function they referenced. Slash invocation is /explain.
---

# Explain Code

The user wants an explanation of code that's already in front of them. Produce a tight, structured explanation grounded in the supplied IDE context.

Structure your response:

1. **One-line summary** — what this code does in plain English.
2. **Flow** — the 3–6 key steps in order. Use a numbered list. Reference function/variable names from the actual code so the reader can map your words back to lines.
3. **Inputs / outputs** — what goes in, what comes out, and the side effects (I/O, state mutation, exceptions).
4. **Why it might surprise you** — at most 2 bullets covering non-obvious behavior (edge cases, hidden ordering assumptions, performance gotchas). Skip the section if there's nothing real to say.

Rules:

- Anchor to the actual code supplied. Do not invent function signatures.
- Use the language's terminology (e.g. "coroutine", "Future", "Promise", "channel") — don't translate to a generic equivalent.
- If the IDE context shows only a snippet and the explanation requires the surrounding file, say so in one line and explain what you can.
- Skip the "this code is a function called X" preamble — the reader can see that.
