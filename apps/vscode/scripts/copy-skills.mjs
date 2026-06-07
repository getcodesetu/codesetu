/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 *
 * Copies the canonical built-in skill files from the repo-root `skills/`
 * directory into `apps/vscode/skills/` so they ship inside the .vsix. The
 * repo-root copy is the SINGLE source of truth; this destination is generated
 * (gitignored) — never hand-edit it. Run before esbuild in the build/dev
 * scripts. Only `<id>/SKILL.md` files are copied (README.md, .DS_Store skipped).
 */

import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", ".."); // apps/vscode/scripts -> repo root
const srcDir = path.join(repoRoot, "skills");
const destDir = path.resolve(here, "..", "skills"); // apps/vscode/skills

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const entry of readdirSync(srcDir)) {
  const skillDir = path.join(srcDir, entry);
  if (!statSync(skillDir).isDirectory()) continue; // skip README.md, .DS_Store, etc.
  const skillFile = path.join(skillDir, "SKILL.md");
  try {
    if (!statSync(skillFile).isFile()) continue;
  } catch {
    continue; // no SKILL.md in this directory
  }
  mkdirSync(path.join(destDir, entry), { recursive: true });
  cpSync(skillFile, path.join(destDir, entry, "SKILL.md"));
  copied += 1;
}

if (copied === 0) {
  console.error(`copy-skills: no SKILL.md files found under ${srcDir}`);
  process.exit(1);
}
console.log(
  `copy-skills: copied ${copied} SKILL.md file(s) into ${path.relative(repoRoot, destDir)}`,
);
