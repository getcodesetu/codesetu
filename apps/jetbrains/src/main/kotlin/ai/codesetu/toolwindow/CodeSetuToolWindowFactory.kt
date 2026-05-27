package ai.codesetu.toolwindow

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import java.awt.BorderLayout
import javax.swing.JButton
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTextArea

class CodeSetuToolWindowFactory : ToolWindowFactory {
  override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
    val panel = CodeSetuChatPanel(project)
    CodeSetuChatService.getInstance(project).register(panel)
    val content = ContentFactory.getInstance().createContent(panel.component, "", false)
    toolWindow.contentManager.addContent(content)
  }
}

class CodeSetuChatPanel(private val project: Project) {
  val component: JPanel = JPanel(BorderLayout())
  private val transcript = JTextArea()
  private val input = JTextArea(4, 40)
  private val send = JButton("Send")
  private val client = CodeSetuProviderClient()
  private val history = mutableListOf<ChatMessage>()

  init {
    transcript.isEditable = false
    component.add(JScrollPane(transcript), BorderLayout.CENTER)
    component.add(JScrollPane(input), BorderLayout.SOUTH)
    component.add(send, BorderLayout.EAST)
    send.addActionListener { sendMessage(input.text) }
  }

  fun sendMessage(text: String, capturedIdeContext: IdeContextPayload? = null) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return

    append("You", trimmed)
    input.text = ""
    send.isEnabled = false

    // Capture editor/document context on the EDT (this method runs on the EDT);
    // reading the selected editor or document text off the EDT is unsafe.
    val ideContext = capturedIdeContext ?: collectIdeContext(project)

    ApplicationManager.getApplication().executeOnPooledThread {
      val instructions = ReadAction.compute<List<WorkspaceInstruction>, RuntimeException> {
        loadWorkspaceInstructions(project)
      }
      val contextMarkdown = buildContextMarkdown(ideContext)
      val userMessage = if (contextMarkdown.isBlank()) {
        trimmed
      } else {
        "$trimmed\n\nCurrent IDE context:\n\n$contextMarkdown"
      }
      history.add(ChatMessage("user", userMessage))
      val messages = listOf(ChatMessage("system", buildSystemMessage(instructions))) + history

      var receivedChunk = false
      val response = try {
        client.streamChat(messages) { chunk ->
          if (!receivedChunk) {
            receivedChunk = true
            ApplicationManager.getApplication().invokeLater {
              beginAppend("CodeSetu")
              appendChunk(chunk)
            }
          } else {
            ApplicationManager.getApplication().invokeLater {
              appendChunk(chunk)
            }
          }
        }
      } catch (error: Exception) {
        if (receivedChunk) {
          // Partial stream then failure: drop the user turn so the next message
          // doesn't stack two consecutive user turns.
          history.removeLastOrNull()
          val message = "\n\nCodeSetu could not complete that request: ${error.message ?: error}"
          ApplicationManager.getApplication().invokeLater {
            appendChunk(message)
            endAppend()
            send.isEnabled = true
          }
          return@executeOnPooledThread
        }

        try {
          client.chat(messages)
        } catch (fallbackError: Exception) {
          history.removeLastOrNull()
          ApplicationManager.getApplication().invokeLater {
            append(
              "CodeSetu",
              "CodeSetu could not complete that request: ${fallbackError.message ?: fallbackError}",
            )
            send.isEnabled = true
          }
          return@executeOnPooledThread
        }
      }

      if (response.isNotBlank()) {
        history.add(ChatMessage("assistant", response))
      } else {
        history.removeLastOrNull()
      }

      ApplicationManager.getApplication().invokeLater {
        if (receivedChunk) {
          if (response.isBlank()) {
            appendChunk("CodeSetu did not return any text.")
          }
          endAppend()
        } else {
          append("CodeSetu", response.ifBlank { "CodeSetu did not return any text." })
        }
        send.isEnabled = true
      }
    }
  }

  private fun append(role: String, text: String) {
    transcript.append("$role:\n$text\n\n")
  }

  private fun beginAppend(role: String) {
    transcript.append("$role:\n")
  }

  private fun appendChunk(text: String) {
    transcript.append(text)
  }

  private fun endAppend() {
    transcript.append("\n\n")
  }
}
