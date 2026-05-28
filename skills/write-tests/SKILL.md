---
id: write-tests
name: Write Tests
description: Generate focused tests for the selected code in the project's existing test framework. Use when the user asks for tests, coverage, or "test this".
whenToUse: When the user wants tests authored for the selected code. Slash invocation is /test or /tests.
---

# Write Tests

Generate tests for the selected code. Match the project's existing test framework — infer it from imports in the active file, the language, or the IDE context. Do not invent a new framework.

Structure your response:

1. **Detected framework** — one line: `vitest`, `jest`, `pytest`, `JUnit 5`, etc. If you can't tell, ask in one sentence which framework to use and stop.
2. **Test code** — one code block. Place tests in the location the project would expect (e.g. `*.test.ts` next to the source, `tests/test_*.py`, `src/test/kotlin/...`). State the suggested file path in a comment on the first line.
3. **Cases covered** — short numbered list of what each test asserts. One line per case.

Rules:

- Cover the happy path first, then 1–3 edge cases that the code actually has (null/empty input, boundary values, error paths, concurrency if relevant). Do not write 12 trivial assertions to pad coverage.
- Don't mock the system under test. Mock only its external collaborators, and only when necessary.
- Use the project's existing helpers/fixtures if they're visible in the IDE context.
- If the selected code has a side effect that's hard to test (network, filesystem, time), structure the test around the smallest realistic seam — and say which seam you used.
- Don't add comments inside the test code explaining what the assertion does — the assertion already says it.
