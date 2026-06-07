import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BUILTIN_SKILLS_FALLBACK, parseBuiltinSkills } from "../src/index.js";
import type { WorkspaceInstructionSource } from "../src/ide/types.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function source(content: string, p = "skills/x/SKILL.md"): WorkspaceInstructionSource {
  return { kind: "skill", path: p, content };
}

const VALID = `---
id: demo
name: Demo
description: A demo skill.
slashCommands: [/demo, /d]
keywords: [do demo, run demo]
---

Body of the demo skill.`;

describe("parseBuiltinSkills", () => {
  it("parses scalars, slash commands, and keywords", () => {
    const { skills, warnings } = parseBuiltinSkills([source(VALID)]);
    expect(warnings).toEqual([]);
    expect(skills).toHaveLength(1);
    const skill = skills[0]!;
    expect(skill.id).toBe("demo");
    expect(skill.name).toBe("Demo");
    expect(skill.slashCommands).toEqual(["/demo", "/d"]);
    expect(skill.keywords).toEqual(["do demo", "run demo"]);
    expect(skill.body).toBe("Body of the demo skill.");
    expect(skill.kind).toBe("skill");
  });

  it("keeps UTF-8 (Devanagari / Tamil) keywords intact", () => {
    const content = `---
id: indic
name: Indic
description: d
slashCommands: [/indic]
keywords: [hindi, हिंदी, tamil, தமிழ்]
---
body`;
    const { skills } = parseBuiltinSkills([source(content)]);
    expect(skills[0]!.keywords).toEqual(["hindi", "हिंदी", "tamil", "தமிழ்"]);
  });

  it("defaults missing list fields to [] and warns", () => {
    const content = `---
id: bare
name: Bare
description: d
---
body`;
    const { skills, warnings } = parseBuiltinSkills([source(content)]);
    expect(skills[0]!.slashCommands).toEqual([]);
    expect(skills[0]!.keywords).toEqual([]);
    expect(warnings.some((w) => w.includes("no slashCommands or keywords"))).toBe(true);
  });

  it("skips entries missing required fields, frontmatter, or body", () => {
    const noFrontmatter = parseBuiltinSkills([source("just text")]);
    expect(noFrontmatter.skills).toHaveLength(0);
    expect(noFrontmatter.warnings[0]).toContain("missing YAML frontmatter");

    const missingField = parseBuiltinSkills([source(`---\nname: X\ndescription: d\n---\nbody`)]);
    expect(missingField.skills).toHaveLength(0);
    expect(missingField.warnings[0]).toContain("missing required field");

    const emptyBody = parseBuiltinSkills([source(`---\nid: e\nname: E\ndescription: d\n---\n`)]);
    expect(emptyBody.skills).toHaveLength(0);
    expect(emptyBody.warnings[0]).toContain("empty skill body");
  });

  it("dedupes by id, keeping the first occurrence", () => {
    const { skills, warnings } = parseBuiltinSkills([
      source(VALID),
      source(VALID, "skills/y/SKILL.md"),
    ]);
    expect(skills).toHaveLength(1);
    expect(warnings.some((w) => w.includes("duplicate skill id"))).toBe(true);
  });

  // Regression guard: the bundled SKILL.md files must yield the same routing
  // metadata (slashCommands/keywords) as the legacy fallback constants. Bodies
  // intentionally differ (the .md prose is now canonical) — assert non-empty.
  it("real SKILL.md files match the fallback constants' routing metadata", () => {
    const ids = BUILTIN_SKILLS_FALLBACK.map((s) => s.id);
    const sources = ids.map((id) => {
      const rel = `skills/${id}/SKILL.md`;
      return source(readFileSync(path.join(REPO_ROOT, rel), "utf8"), rel);
    });

    const { skills, warnings } = parseBuiltinSkills(sources);
    expect(warnings).toEqual([]);
    expect(skills.map((s) => s.id).sort()).toEqual([...ids].sort());

    for (const fallback of BUILTIN_SKILLS_FALLBACK) {
      const loaded = skills.find((s) => s.id === fallback.id)!;
      expect(loaded.slashCommands).toEqual([...fallback.slashCommands]);
      expect(loaded.keywords).toEqual([...fallback.keywords]);
      expect(loaded.body.length).toBeGreaterThan(0);
    }
  });
});
