package ai.codesetu.agent

import com.intellij.codeInsight.daemon.impl.HighlightInfo
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.editor.impl.DocumentMarkupModel
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

private const val MAX_DIAGNOSTICS = 100

/**
 * IDE-native, read-only tool that reports the IDE's current errors/warnings (the
 * squiggles from the language plugins / inspections) — something a terminal
 * agent can't reach. Reflects the daemon's current analysis, so it covers the
 * requested file or the currently-open editors. Auto-approved (safe).
 */
class GetDiagnosticsTool(private val project: Project) : AgentTool {
  override val name = "get_diagnostics"
  override val description =
    "Get the IDE's current errors and warnings (the squiggles from the language " +
      "plugins / inspections) for a single file or the currently-open files. Use " +
      "this to confirm a change is clean instead of running a full build."
  override val risk = ToolRisk.SAFE
  override val parameters = buildJsonObject {
    put("type", "object")
    put("additionalProperties", false)
    putJsonArray("required") {}
    putJsonObject("properties") {
      putJsonObject("path") {
        put("type", "string")
        put("description", "Limit to this file (workspace-relative or absolute). Omit for open files.")
      }
      putJsonObject("severity") {
        put("type", "string")
        putJsonArray("enum") {
          add("error")
          add("warning")
          add("all")
        }
        put("description", "Minimum severity to include (default \"warning\" = errors + warnings).")
      }
    }
  }

  override fun execute(args: JsonObject, host: AgentHost): ToolResult {
    val pathArg = args["path"]?.jsonPrimitive?.contentOrNull
    val minSeverity =
      when (args["severity"]?.jsonPrimitive?.contentOrNull) {
        "error" -> HighlightSeverity.ERROR
        "all" -> HighlightSeverity.INFORMATION
        else -> HighlightSeverity.WARNING
      }

    val lines =
      ReadAction.compute<List<String>, RuntimeException> {
        val basePath = project.basePath
        val files: List<VirtualFile> =
          if (pathArg != null) {
            val resolved =
              if (File(pathArg).isAbsolute) pathArg else "${basePath?.trimEnd('/')}/$pathArg"
            listOfNotNull(LocalFileSystem.getInstance().findFileByPath(resolved))
          } else {
            FileEditorManager.getInstance(project).openFiles.toList()
          }

        var errors = 0
        var warnings = 0
        val out = ArrayList<String>()
        for (file in files) {
          if (out.size >= MAX_DIAGNOSTICS) break
          val document = FileDocumentManager.getInstance().getDocument(file) ?: continue
          // Read the daemon's highlights from the document markup model (public
          // API) rather than the @Internal DaemonCodeAnalyzerImpl. Syntax-only
          // highlighters return null from fromRangeHighlighter and are skipped.
          val markupModel = DocumentMarkupModel.forDocument(document, project, true)
          val relative =
            if (basePath != null && file.path.startsWith("$basePath/")) {
              file.path.removePrefix("$basePath/")
            } else {
              file.path
            }
          for (highlighter in markupModel.allHighlighters) {
            if (out.size >= MAX_DIAGNOSTICS) break
            val info = HighlightInfo.fromRangeHighlighter(highlighter) ?: continue
            if (info.severity < minSeverity) continue
            val description = info.description ?: continue
            val severity =
              when {
                info.severity >= HighlightSeverity.ERROR -> {
                  errors++
                  "error"
                }
                info.severity >= HighlightSeverity.WARNING -> {
                  warnings++
                  "warning"
                }
                else -> "info"
              }
            val line = document.getLineNumber(info.startOffset) + 1
            out.add("$relative:$line: [$severity] $description")
          }
        }
        if (out.isEmpty()) emptyList() else listOf("$errors error(s), $warnings warning(s)") + out
      }

    return if (lines.isEmpty()) ToolResult("No diagnostics found.") else ToolResult(lines.joinToString("\n"))
  }
}
