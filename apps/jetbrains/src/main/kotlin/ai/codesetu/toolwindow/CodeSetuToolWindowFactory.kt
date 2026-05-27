package ai.codesetu.toolwindow

import ai.codesetu.context.collectIdeContext
import ai.codesetu.instructions.loadWorkspaceInstructions
import ai.codesetu.model.ChatMessage
import ai.codesetu.model.IdeContextPayload
import ai.codesetu.model.WorkspaceInstruction
import ai.codesetu.provider.CodeSetuProviderClient
import ai.codesetu.prompts.buildContextMarkdown
import ai.codesetu.prompts.buildSystemMessage
import ai.codesetu.settings.CodeSetuModelCatalog
import ai.codesetu.settings.CodeSetuSettingsState
import ai.codesetu.settings.resolveCodeSetuModel
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.content.ContentFactory
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.event.ActionEvent
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.AbstractAction
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.KeyStroke
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
  private val input = JBTextArea(4, 40)
  private val send = JButton("Send")
  private val modelBox = ComboBox<String>()
  private val client = CodeSetuProviderClient()
  private val history = mutableListOf<ChatMessage>()
  private var inFlight = false

  private fun setBusy(busy: Boolean) {
    inFlight = busy
    send.isEnabled = !busy
    input.isEnabled = !busy
    modelBox.isEnabled = !busy
  }

  init {
    transcript.isEditable = false
    transcript.lineWrap = true
    transcript.wrapStyleWord = true
    transcript.border = JBUI.Borders.empty(8)

    input.lineWrap = true
    input.wrapStyleWord = true
    input.border = JBUI.Borders.empty(4)
    input.emptyText.text = "Ask CodeSetu  (⌘/Ctrl+Enter to send)"

    modelBox.isEditable = true
    populateModelBox()
    modelBox.addActionListener { onModelSelected() }

    // Top bar: model selector.
    val header = JPanel(BorderLayout())
    header.border = JBUI.Borders.empty(6, 8)
    header.add(JLabel("Model: "), BorderLayout.WEST)
    header.add(modelBox, BorderLayout.CENTER)

    // Bottom composer: input grows; Send sits at its natural size, bottom-right.
    val sendBar = JPanel(BorderLayout())
    sendBar.border = JBUI.Borders.emptyLeft(6)
    sendBar.add(send, BorderLayout.SOUTH)

    val composer = JPanel(BorderLayout())
    composer.border = JBUI.Borders.empty(6, 8, 8, 8)
    val inputScroll = JBScrollPane(input)
    inputScroll.preferredSize = Dimension(0, 92)
    composer.add(inputScroll, BorderLayout.CENTER)
    composer.add(sendBar, BorderLayout.EAST)

    component.add(header, BorderLayout.NORTH)
    component.add(JBScrollPane(transcript), BorderLayout.CENTER)
    component.add(composer, BorderLayout.SOUTH)

    send.addActionListener { sendMessage(input.text) }
    registerSendShortcut()
  }

  private fun registerSendShortcut() {
    val action = object : AbstractAction() {
      override fun actionPerformed(e: ActionEvent) {
        sendMessage(input.text)
      }
    }
    input.actionMap.put("codesetu.send", action)
    input.inputMap.put(
      KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, InputEvent.CTRL_DOWN_MASK),
      "codesetu.send",
    )
    input.inputMap.put(
      KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, InputEvent.META_DOWN_MASK),
      "codesetu.send",
    )
  }

  private fun populateModelBox() {
    val state = CodeSetuSettingsState.getInstance().state
    val current = resolveCodeSetuModel(state.model)
    val items = (listOf(current) + CodeSetuModelCatalog.suggestionsFor(state.provider)).distinct()
    modelBox.removeAllItems()
    items.forEach { modelBox.addItem(it) }
    modelBox.selectedItem = current
  }

  private fun onModelSelected() {
    val selected = (modelBox.selectedItem as? String)?.trim().orEmpty()
    if (selected.isEmpty()) return
    val state = CodeSetuSettingsState.getInstance().state
    if (selected != state.model) {
      state.model = selected
    }
  }

  fun sendMessage(text: String, capturedIdeContext: IdeContextPayload? = null) {
    val trimmed = text.trim()
    if (trimmed.isEmpty() || inFlight) return

    append("You", trimmed)
    input.text = ""
    setBusy(true)

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
            setBusy(false)
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
            setBusy(false)
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
        setBusy(false)
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
