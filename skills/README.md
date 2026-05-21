# CodeSetu Skills

A **skill** is a named capability the assistant can opt into for a given turn.
Skills are loaded by the host (VSCode, JetBrains, CLI) and offered to the model
when its routing pass decides the user's intent matches.

## Layout

```
skills/
└── <skill-id>/
    ├── SKILL.md       # required — frontmatter + body
    └── assets/        # optional — examples, templates, fixtures
```

`<skill-id>` is kebab-case and globally unique inside this repo.

## SKILL.md format

```markdown
---
id: indic-code-comments
name: Indic Code Comments
description: Generate or translate code comments in Indian languages.
whenToUse: When the user asks for comments in Hindi, Tamil, Bengali, or other Indic languages.
requiredTools: []
---

# Indic Code Comments

You are helping a developer write or translate code comments into an Indic
language. Preserve technical accuracy and keep comments concise...
```

### Required frontmatter fields

| Field         | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `id`          | kebab-case, matches the folder name                 |
| `name`        | Human-readable title shown in UI                    |
| `description` | One line — the router reads this to score relevance |

### Optional frontmatter fields

| Field           | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| `whenToUse`     | Longer guidance included verbatim in the routing prompt |
| `requiredTools` | List of tool ids the skill expects to be registered     |

The body (everything after the frontmatter) is the prompt fragment activated
when the skill is selected.

## Authoring tips

- Skills should be **scoped**: one capability per skill, not a kitchen sink.
- `description` is what the router reads — make it specific enough that the
  router can disambiguate from other skills.
- Skills are loaded at activation, so keep the body focused. Long examples
  belong in `assets/` and can be referenced by relative path.

## Loading

Hosts discover skills by scanning `skills/*/SKILL.md` at activation. The
`@codesetu/plugin-sdk` `SkillManifest` type is the runtime representation; the
loader parses frontmatter into that shape.

Plugins can also register skills programmatically via `PluginContext.registerSkill`.
