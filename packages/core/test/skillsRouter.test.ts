import { describe, expect, it } from "vitest";

import { BUILTIN_SKILLS, routeSkills } from "../src/index.js";

describe("routeSkills", () => {
  it("pins a skill by id regardless of message content", () => {
    const result = routeSkills({
      userText: "tell me a joke about cats",
      skills: BUILTIN_SKILLS,
      pinnedIds: ["plan-mode"],
    });

    expect(result.selected.map((s) => s.id)).toContain("plan-mode");
    expect(result.cleanedUserText).toBe("tell me a joke about cats");
  });

  it("routes /explain to the explain-code skill and strips the command", () => {
    const result = routeSkills({
      userText: "/explain how the auth middleware fits together",
      skills: BUILTIN_SKILLS,
    });

    expect(result.selected.map((s) => s.id)).toContain("explain-code");
    expect(result.consumedSlash).toBe("/explain");
    expect(result.cleanedUserText).toBe("how the auth middleware fits together");
  });

  it("routes /test and /tests to write-tests", () => {
    expect(
      routeSkills({ userText: "/test the parser", skills: BUILTIN_SKILLS }).selected.map(
        (s) => s.id,
      ),
    ).toContain("write-tests");
    expect(
      routeSkills({ userText: "/tests", skills: BUILTIN_SKILLS }).selected.map((s) => s.id),
    ).toContain("write-tests");
  });

  it("ignores a slash that is not at the start of the message", () => {
    const result = routeSkills({
      userText: "the path /explain is just a URL",
      skills: BUILTIN_SKILLS,
    });

    expect(result.consumedSlash).toBeUndefined();
    expect(result.cleanedUserText).toBe("the path /explain is just a URL");
  });

  it("auto-routes by keyword when no slash is present", () => {
    const result = routeSkills({
      userText: "please refactor this function for readability",
      skills: BUILTIN_SKILLS,
    });

    expect(result.selected.map((s) => s.id)).toContain("refactor");
  });

  it("auto-routes Indic keyword (Hindi) to indic-comments", () => {
    const result = routeSkills({
      userText: "Add comments in हिंदी for this function",
      skills: BUILTIN_SKILLS,
    });

    expect(result.selected.map((s) => s.id)).toContain("indic-comments");
  });

  it("respects autoRoute=false — no keyword routing without a slash", () => {
    const result = routeSkills({
      userText: "please refactor this function",
      skills: BUILTIN_SKILLS,
      autoRoute: false,
    });

    expect(result.selected.map((s) => s.id)).not.toContain("refactor");
  });

  it("caps auto-routed selection at 1 skill even if multiple match", () => {
    const result = routeSkills({
      // Both "explain" and "refactor" keywords are present; only the higher
      // scorer should be auto-included.
      userText: "explain this and then refactor it for readability",
      skills: BUILTIN_SKILLS,
    });

    const autoIds = result.selected.map((s) => s.id);
    // Exactly one of explain-code / refactor should be selected.
    const matched = autoIds.filter((id) => id === "explain-code" || id === "refactor");
    expect(matched.length).toBe(1);
  });

  it("never duplicates a pinned skill that also matches a slash or keyword", () => {
    const result = routeSkills({
      userText: "/plan refactor the parser for readability",
      skills: BUILTIN_SKILLS,
      pinnedIds: ["plan-mode"],
    });

    const ids = result.selected.map((s) => s.id);
    const planCount = ids.filter((id) => id === "plan-mode").length;
    expect(planCount).toBe(1);
  });
});
