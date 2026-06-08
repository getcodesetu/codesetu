package ai.codesetu.agent

/**
 * Filesystem and shell primitives the agent tools run against. The host owns
 * sandboxing — paths are resolved and contained against the project root, and
 * commands run from it. Mirrors the AgentHost contract in @codesetu/core so the
 * two surfaces stay conceptually identical.
 */
interface AgentHost {
  /** Absolute project root, or null for ad-hoc/no-project sessions. */
  fun rootPath(): String?

  /** Read a UTF-8 text file. `path` may be relative to the root or absolute. */
  fun readFile(path: String): String

  /** Write a UTF-8 text file, creating parent directories as needed. */
  fun writeFile(path: String, content: String)

  /** Run a shell command from the project root with a wall-clock timeout. */
  fun exec(command: String, timeoutMs: Long): ExecResult
}

data class ExecResult(
  val stdout: String,
  val stderr: String,
  /** Process exit code, or null if it was killed (timeout/signal). */
  val exitCode: Int?,
)
