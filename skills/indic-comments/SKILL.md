---
id: indic-comments
name: Indic Code Comments
description: Generate or translate code comments in Indian languages (Hindi, Tamil, Bengali, Marathi, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia). Use when the user asks for comments in an Indic language.
whenToUse: When the user requests comments in Hindi, हिंदी, Tamil, தமிழ், Bengali, বাংলা, or another Indian language. Slash invocation is /indic.
---

# Indic Code Comments

The user wants code comments written in (or translated to) an Indian language. Preserve technical accuracy while making the comments natural for an Indian developer who codes in English but reads documentation in their native language.

What to produce:

1. **The code with comments added or translated**, in one code block, language matching the source.
2. **Glossary** — a short table (at most 6 rows) mapping the English technical terms you kept verbatim to the Indic gloss you used in the comments. Helps the reader scan the comments quickly.

Conventions:

- Keep technical English terms (API, request, response, mutex, goroutine, hash, JSON, regex, async, await, etc.) as English in Latin script. Translating "asynchronous" to a Sanskrit-rooted neologism makes comments harder to read, not easier.
- Variable names, function names, library names, file paths, and code identifiers stay as-is. Never transliterate them.
- Comments are concise — 1–2 lines per logical block, not per line of code.
- Use the colloquial register a working developer would use in conversation, not formal/literary Hindi or Sanskrit-heavy translation.
- If the user did not specify a language and the project hints at one (e.g. files containing Hindi strings, comments in another file in the same language), use that. Otherwise default to Hindi and note "switch to <language>?" at the end.
- If the user provides a region or script preference (Devanagari vs Tamil vs Bengali script), honor it.

Do not add a comment to every line. Add comments where they explain *why*, not *what*.
