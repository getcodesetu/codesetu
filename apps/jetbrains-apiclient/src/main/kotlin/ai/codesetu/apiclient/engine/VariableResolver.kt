package ai.codesetu.apiclient.engine

import ai.codesetu.apiclient.model.Variable
import ai.codesetu.apiclient.model.VariableScope
import java.util.UUID

/** Kotlin mirror of packages/api-client-core/src/engine/variables.ts. */
object VariableResolver {
  private val pattern = Regex("\\{\\{\\s*([^{}]+?)\\s*}}")
  private const val MAX_DEPTH = 12

  fun resolve(template: String, scope: VariableScope): String {
    val map = buildMap(scope)
    var current = template
    for (depth in 0 until MAX_DEPTH) {
      var changed = false
      current = pattern.replace(current) { match ->
        val key = match.groupValues[1].trim()
        val dynamic = dynamic(key)
        when {
          dynamic != null -> {
            changed = true
            dynamic
          }
          map.containsKey(key) -> {
            changed = true
            map.getValue(key)
          }
          else -> match.value
        }
      }
      if (!changed) break
    }
    return current
  }

  fun hasUnresolved(value: String): Boolean = pattern.containsMatchIn(value)

  private fun buildMap(scope: VariableScope): Map<String, String> {
    val map = LinkedHashMap<String, String>()
    apply(map, scope.globals)
    apply(map, scope.collection)
    apply(map, scope.environment)
    map.putAll(scope.local)
    return map
  }

  private fun apply(map: MutableMap<String, String>, variables: List<Variable>) {
    for (variable in variables) {
      if (variable.enabled) {
        map[variable.key] = variable.value
      }
    }
  }

  private fun dynamic(key: String): String? = when (key) {
    "\$guid", "\$randomUUID" -> UUID.randomUUID().toString()
    "\$timestamp" -> (System.currentTimeMillis() / 1000).toString()
    "\$isoTimestamp" -> java.time.Instant.now().toString()
    "\$randomInt" -> (0..1000).random().toString()
    else -> null
  }
}
