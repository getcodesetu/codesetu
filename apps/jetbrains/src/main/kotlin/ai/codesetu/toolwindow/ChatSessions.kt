package ai.codesetu.toolwindow

import ai.codesetu.model.ChatMessage
import kotlinx.serialization.Serializable

/** Most chats to keep; oldest are dropped past this. */
const val MAX_CHAT_SESSIONS = 50

/**
 * One saved conversation. Kotlin mirror of the VS Code `ChatSession`, persisted
 * as JSON so a reload (or IDE restart) resumes — and lets the user switch chats.
 */
@Serializable
data class ChatSession(
  val id: String,
  val title: String,
  val messages: List<ChatMessage>,
  val updatedAt: Long,
)

/** A short, human-readable title from the first user message (or a fallback). */
fun deriveSessionTitle(messages: List<ChatMessage>): String {
  val firstUser = messages.firstOrNull { it.role == "user" }?.content?.trim().orEmpty()
  if (firstUser.isEmpty()) return "New chat"
  val oneLine = firstUser.replace(Regex("\\s+"), " ")
  return if (oneLine.length <= 48) oneLine else oneLine.take(47).trimEnd() + "…"
}

/** Insert or replace [session] by id, newest first, capped at [MAX_CHAT_SESSIONS]. */
fun upsertSession(sessions: List<ChatSession>, session: ChatSession): List<ChatSession> {
  val without = sessions.filter { it.id != session.id }
  return (listOf(session) + without)
    .sortedByDescending { it.updatedAt }
    .take(MAX_CHAT_SESSIONS)
}

fun removeSession(sessions: List<ChatSession>, id: String): List<ChatSession> =
  sessions.filter { it.id != id }

/** Compact "just now / 5m ago / 3h ago / 2d ago" label. */
fun relativeTime(updatedAt: Long, now: Long): String {
  val seconds = ((now - updatedAt) / 1000).coerceAtLeast(0)
  return when {
    seconds < 45 -> "just now"
    seconds < 3600 -> "${seconds / 60}m ago"
    seconds < 86_400 -> "${seconds / 3600}h ago"
    else -> "${seconds / 86_400}d ago"
  }
}
