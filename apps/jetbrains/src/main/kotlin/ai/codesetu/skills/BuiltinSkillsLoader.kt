/*
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Phase 2 loader: reads built-in skills from the bundled skills/<id>/SKILL.md
 * resources (single source of truth, copied from the repo root at build time —
 * see build.gradle.kts copyBuiltinSkills). Falls back to the hard-coded
 * BUILTIN_SKILLS constants per-skill if a file is missing or unparseable, so
 * skills never silently vanish. The set of ids comes from the fallback list.
 */
package ai.codesetu.skills

import ai.codesetu.model.WorkspaceInstruction
import com.intellij.openapi.diagnostic.Logger

private val LOG = Logger.getInstance("ai.codesetu.skills.BuiltinSkillsLoader")

@Volatile
private var cached: List<BuiltinSkill>? = null

/**
 * The built-in skills to use at runtime: loaded from bundled SKILL.md files,
 * with per-skill fallback to the constants. Loaded once and cached.
 */
fun loadBuiltinSkills(): List<BuiltinSkill> {
  cached?.let { return it }
  val loader = object {}.javaClass.classLoader
  var loadedCount = 0
  val skills = BUILTIN_SKILLS.map { fallback ->
    val path = "skills/${fallback.id}/SKILL.md"
    val content = runCatching {
      loader.getResourceAsStream(path)?.use { it.readBytes().toString(Charsets.UTF_8) }
    }.getOrNull()
    if (content == null) {
      LOG.info("CodeSetu: $path not on classpath; using built-in default for '${fallback.id}'")
      return@map fallback
    }
    val parsed = parseBuiltinSkill(content, path)
    if (parsed == null) {
      LOG.warn("CodeSetu: failed to parse $path; using built-in default for '${fallback.id}'")
      fallback
    } else {
      loadedCount += 1
      parsed
    }
  }
  LOG.info("CodeSetu: loaded $loadedCount/${BUILTIN_SKILLS.size} built-in skills from bundle")
  cached = skills
  return skills
}

private val FRONTMATTER = Regex("^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?([\\s\\S]*)$")

private fun parseBuiltinSkill(content: String, path: String): BuiltinSkill? {
  val match = FRONTMATTER.find(content) ?: return null
  val body = match.groupValues[2].trim()
  if (body.isEmpty()) return null

  val scalars = mutableMapOf<String, String>()
  val lists = mutableMapOf<String, List<String>>()
  for (line in match.groupValues[1].lines()) {
    val sep = line.indexOf(":")
    if (sep == -1) continue
    val key = line.take(sep).trim()
    if (key.isEmpty()) continue
    val raw = line.drop(sep + 1).trim()
    if (raw.startsWith("[") && raw.endsWith("]")) {
      lists[key] = raw.substring(1, raw.length - 1)
        .split(",")
        .map { it.trim().trim('"', '\'') }
        .filter { it.isNotEmpty() }
    } else {
      scalars[key] = raw.trim('"', '\'')
    }
  }

  val id = scalars["id"].orEmpty()
  val name = scalars["name"].orEmpty()
  val description = scalars["description"].orEmpty()
  if (id.isEmpty() || name.isEmpty() || description.isEmpty()) return null

  return BuiltinSkill(
    instruction = WorkspaceInstruction(
      id = id,
      name = name,
      description = description,
      sourcePath = path,
      body = body,
    ),
    slashCommands = lists["slashCommands"] ?: emptyList(),
    keywords = lists["keywords"] ?: emptyList(),
  )
}
