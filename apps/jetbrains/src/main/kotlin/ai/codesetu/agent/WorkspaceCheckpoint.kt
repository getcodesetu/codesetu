package ai.codesetu.agent

import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files

data class RevertResult(val restored: Int, val deleted: Int, val failed: Int)

/**
 * Records the pre-edit state of every file the agent writes during a turn, so
 * the whole turn's file changes can be undone in one click.
 *
 * Scope: this captures structured edits (write_file / edit_file, which both go
 * through [AgentHost.writeFile]). Side effects of `bash` commands are NOT
 * tracked and cannot be reverted this way. Pure filesystem — no platform deps —
 * so it stays unit-testable; the caller refreshes the VFS after a revert.
 * Mirrors the VS Code WorkspaceCheckpoint.
 */
class WorkspaceCheckpoint(private val root: String?) {
  private data class Snapshot(val file: File, val relPath: String, val original: String?)

  // Keyed by canonical absolute path; only the FIRST snapshot per file is kept,
  // so revert restores the state from before the turn began.
  private val snapshots = LinkedHashMap<String, Snapshot>()

  fun capture(path: String) {
    val base = File(root ?: System.getProperty("user.dir")).canonicalFile
    val file = File(path).let { if (it.isAbsolute) it else File(base, path) }.canonicalFile
    val key = file.path
    if (snapshots.containsKey(key)) return
    val original =
      if (file.isFile) {
        try {
          String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8)
        } catch (error: Exception) {
          null
        }
      } else {
        null // did not exist (or unreadable) — revert deletes it
      }
    val rel = runCatching { base.toPath().relativize(file.toPath()).toString() }.getOrNull()
    snapshots[key] = Snapshot(file, rel?.ifEmpty { path } ?: path, original)
  }

  fun isEmpty(): Boolean = snapshots.isEmpty()

  fun changedFiles(): List<String> = snapshots.values.map { it.relPath }.sorted()

  /** Restore every captured file to its pre-turn state. */
  fun revert(): RevertResult {
    var restored = 0
    var deleted = 0
    var failed = 0
    for (snap in snapshots.values) {
      try {
        if (snap.original == null) {
          Files.deleteIfExists(snap.file.toPath())
          deleted += 1
        } else {
          snap.file.parentFile?.mkdirs()
          Files.write(snap.file.toPath(), snap.original.toByteArray(StandardCharsets.UTF_8))
          restored += 1
        }
      } catch (error: Exception) {
        failed += 1
      }
    }
    return RevertResult(restored, deleted, failed)
  }
}

/**
 * Wrap an [AgentHost] so each write is snapshotted into the returned checkpoint
 * before it lands. The wrapped host is otherwise identical to the delegate.
 */
fun checkpointingHost(delegate: AgentHost): Pair<AgentHost, WorkspaceCheckpoint> {
  val checkpoint = WorkspaceCheckpoint(delegate.rootPath())
  val wrapped =
    object : AgentHost by delegate {
      override fun writeFile(path: String, content: String) {
        checkpoint.capture(path)
        delegate.writeFile(path, content)
      }
    }
  return wrapped to checkpoint
}
