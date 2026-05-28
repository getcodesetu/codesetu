# JetBrains Marketplace pages

Standalone markdown sources for the **JetBrains Marketplace Custom Pages** under
the CodeSetu vendor profile. Paste each file into the corresponding page on
[plugins.jetbrains.com](https://plugins.jetbrains.com) (the Marketplace UI
accepts markdown).

These pages complement the plugin listing description (which is rendered from
`apps/jetbrains/src/main/resources/META-INF/plugin.xml`). The listing is the
landing page; these are deeper docs.

| File                                               | Suggested page title |
| -------------------------------------------------- | -------------------- |
| [quickstart.md](quickstart.md)                     | Quickstart           |
| [providers-and-models.md](providers-and-models.md) | Providers & Models   |
| [privacy-and-security.md](privacy-and-security.md) | Privacy & Security   |
| [faq.md](faq.md)                                   | FAQ                  |

Keep these in sync with the plugin description and `INSTALL.md` when you ship a
release.
