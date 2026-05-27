package ai.codesetu.toolwindow

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import com.intellij.openapi.application.ApplicationManager
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

    ApplicationManager.getApplication().executeOnPooledThread {
      val instructions = loadWorkspaceInstructions(project)
      val ideContext = buildContextMarkdown(capturedIdeContext ?: collectIdeContext(project))
      val userMessage = if (ideContext.isBlank()) {
        trimmed
      } else {
        "$trimmed\n\nCurrent IDE context:\n\n$ideContext"
      }
      val messages = listOf(
        ChatMessage("system", buildSystemMessage(instructions)),
        ChatMessage("user", userMessage),
      )
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
          "CodeSetu could not complete that request: ${fallbackError.message ?: fallbackError}"
        }
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
