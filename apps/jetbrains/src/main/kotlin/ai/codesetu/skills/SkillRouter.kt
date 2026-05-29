/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Kotlin mirror of packages/core/src/skills/router.ts.
 */
package ai.codesetu.skills

import ai.codesetu.model.WorkspaceInstruction

data class RouteSkillsResult(
  val selected: List<WorkspaceInstruction>,
  val consumedSlash: String? = null,
  val cleanedUserText: String,
)

private const val MAX_AUTO_ROUTED = 1

fun routeSkills(
  userText: String,
  skills: List<BuiltinSkill>,
  pinnedIds: List<String> = emptyList(),
  autoRoute: Boolean = true,
): RouteSkillsResult {
  val seen = mutableSetOf<String>()
  val selected = mutableListOf<WorkspaceInstruction>()

  fun pushOnce(skill: BuiltinSkill) {
    if (seen.add(skill.id)) {
      selected += skill.instruction
    }
  }

  for (id in pinnedIds) {
    skills.firstOrNull { it.id == id }?.let(::pushOnce)
  }

  var cleanedUserText = userText
  var consumedSlash: String? = null
  val slashMatch = matchSlashCommand(userText, skills)
  if (slashMatch != null) {
    pushOnce(slashMatch.skill)
    cleanedUserText = slashMatch.remainder
    consumedSlash = slashMatch.command
  }

  if (autoRoute) {
    scoreByKeywords(cleanedUserText, skills)
      .asSequence()
      .filterNot { seen.contains(it.first.id) }
      .take(MAX_AUTO_ROUTED)
      .forEach { pushOnce(it.first) }
  }

  return RouteSkillsResult(
    selected = selected,
    consumedSlash = consumedSlash,
    cleanedUserText = cleanedUserText,
  )
}

private data class SlashMatch(val skill: BuiltinSkill, val command: String, val remainder: String)

private fun matchSlashCommand(userText: String, skills: List<BuiltinSkill>): SlashMatch? {
  val trimmed = userText.trimStart()
  if (!trimmed.startsWith("/")) return null

  val spaceIndex = trimmed.indexOfFirst { it.isWhitespace() }
  val candidate = if (spaceIndex == -1) trimmed else trimmed.substring(0, spaceIndex)
  val remainder = if (spaceIndex == -1) "" else trimmed.substring(spaceIndex + 1)

  return skills
    .firstOrNull { candidate in it.slashCommands }
    ?.let { SlashMatch(it, candidate, remainder) }
}

private fun scoreByKeywords(
  userText: String,
  skills: List<BuiltinSkill>,
): List<Pair<BuiltinSkill, Int>> {
  val haystack = userText.lowercase()
  if (haystack.isBlank()) return emptyList()

  return skills
    .mapNotNull { skill ->
      val score = skill.keywords.sumOf { keyword ->
        if (haystack.contains(keyword.lowercase())) keyword.length else 0
      }
      if (score >= 4) skill to score else null
    }
    .sortedByDescending { it.second }
}
