# Examples

How to actually use CodeSetu day-to-day — patterns that work well, with
example prompts you can paste verbatim.

---

## Anatomy of a CodeSetu request

When you send a chat message, CodeSetu automatically attaches:

- The **path, language, and contents** of your active editor file
  (trimmed in the middle if the file is huge).
- Your **current selection**.
- A **cursor neighborhood** — a few thousand characters around the caret.

So short, specific prompts work — you don't have to paste your code. The
assistant already sees it.

> Don't want any of this on a particular message? Open the **+** menu in the
> composer and toggle **Include IDE context** off.

---

## The fastest path — selected-code actions

Select a function or block in the editor → **right-click** → pick one:

- **Explain with CodeSetu** — structured walkthrough of what it does, key
  control flow, inputs/outputs, risks.
- **Refactor with CodeSetu** — focused refactor proposal with the trade-offs
  called out.
- **Write Tests with CodeSetu** — happy path plus edge cases.
- **Fix Bug with CodeSetu** — diagnoses the likely issue plus a minimal patch.
- **Add Docs with CodeSetu** — idiomatic doc comments for the language.

The chat tool window opens with the answer streamed in.

---

## Useful chat prompts

### Code understanding

- "Explain what this file does and how the main function fits in."
- "What's the time and space complexity of the selected function?"
- "Trace what happens when this handler is called with an empty list."

### Refactoring

- "Refactor the selected function for readability without changing behavior. List the changes you made."
- "Extract the selected block into a well-named helper. Show the full updated file."
- "Replace the nested if/else with a switch (or early returns) — whichever is clearer."

### Testing

- "Write Jest unit tests for the selected function. Cover happy path and edge cases."
- "Add a test for what happens when the input list is empty."
- "Generate a property-based test for the selected pure function."

### Debugging

- "What might cause this function to throw a null-pointer exception? Give the smallest safe fix."
- "Why is this test failing? Walk through the assertion that breaks."
- "Add logging at the right spots to find where the value diverges from what I expect."

### Documentation

- "Add JSDoc comments to the selected function — describe each parameter and the return value."
- "Write a brief README section for this module: install, usage, and a code example."
- "Generate an API reference for the selected class."

### Translation / migration

- "Translate the selected Python function to TypeScript with equivalent types."
- "Convert this synchronous code to async/await."
- "Port the selected callback-based code to use Promises."

### Generation

- "Generate a regex that matches Indian phone numbers (+91, 10 digits, optional spaces)."
- "Give me a SQL query that joins users and orders, grouped by month, last 90 days."
- "Write a small CLI in Go that prints `Hello, <name>!` from a flag."

---

## Workspace skills — make the assistant follow your conventions

Drop a `.codesetu/skills/code-style.md` file at the root of your project:

```markdown
---
id: code-style
name: Code style
description: Apply our team's style.
---

Follow these rules when suggesting code:

- TypeScript: prefer `type` over `interface` for unions.
- Functions: keep under 40 lines, single responsibility.
- Imports: absolute paths via `@/`.
- Tests: arrange / act / assert blocks separated by blank lines.
```

That body is folded into the system prompt for **every** message, so the
assistant follows your conventions without you re-prompting.

You can also drop `.codesetu/checks/*.md` files for review-style guidance.

---

## Tips

- **Toggle "Include IDE context" off** for general questions that have nothing
  to do with your code — keeps prompts small.
- **Switch model for the task** — small/fast for tiny edits, larger for
  refactors. Click the chip → **Custom model id…** to use any model your
  provider serves.
- **Multi-turn works** — follow-ups in the same session remember earlier turns.
- **Click Send (↑)** to submit; the composer is multi-line, so plain Enter
  inserts a newline.
- **Configure once, then switch easily** — click the chip → **⚙ Configure
  provider / endpoint…** for the full set-up flow; the **Enter a custom model
  id…** option lets you jump between models quickly.
