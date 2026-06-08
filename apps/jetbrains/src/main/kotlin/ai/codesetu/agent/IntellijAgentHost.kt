package ai.codesetu.agent

import com.intellij.execution.configurations.GeneralCommandLine
import com.intellij.execution.process.CapturingProcessHandler
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.vfs.LocalFileSystem
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files

/**
 * IntelliJ-platform AgentHost. Reads/writes via java.nio (then refreshes the VFS
 * so open editors pick up the change) and runs commands through
 * GeneralCommandLine. Every path is contained within the project root.
 */
class IntellijAgentHost(project: Project) : AgentHost {
  private val root: String? = project.basePath

  override fun rootPath(): String? = root

  private fun resolveWithinRoot(path: String): File {
    val base = File(root ?: System.getProperty("user.dir")).canonicalFile
    val candidate = File(path).let { if (it.isAbsolute) it else File(base, path) }
    val resolved = candidate.canonicalFile
    val contained =
      resolved == base || resolved.path.startsWith(base.path + File.separator)
    if (!contained) {
      error("Path escapes the workspace root: $path")
    }
    return resolved
  }

  override fun readFile(path: String): String {
    val file = resolveWithinRoot(path)
    return String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
  }

  override fun writeFile(path: String, content: String) {
    val file = resolveWithinRoot(path)
    file.parentFile?.mkdirs()
    Files.write(file.toPath(), content.toByteArray(StandardCharsets.UTF_8))
    // Sync the VFS / any open editor with the on-disk change.
    LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)?.refresh(false, false)
  }

  override fun exec(command: String, timeoutMs: Long): ExecResult {
    val commandLine =
      if (SystemInfo.isWindows) {
        GeneralCommandLine("cmd", "/c", command)
      } else {
        GeneralCommandLine("/bin/sh", "-c", command)
      }
    commandLine.charset = StandardCharsets.UTF_8
    root?.let { commandLine.withWorkDirectory(it) }

    val output = CapturingProcessHandler(commandLine).runProcess(timeoutMs.toInt())
    val stderr =
      if (output.isTimeout) "${output.stderr}\n[timed out after ${timeoutMs}ms]" else output.stderr
    val exitCode = if (output.isTimeout) null else output.exitCode
    return ExecResult(output.stdout, stderr, exitCode)
  }
}
