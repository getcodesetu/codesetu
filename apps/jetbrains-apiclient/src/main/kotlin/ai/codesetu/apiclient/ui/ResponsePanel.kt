package ai.codesetu.apiclient.ui

import ai.codesetu.apiclient.model.HttpResponse
import java.awt.BorderLayout
import java.awt.Color
import java.awt.FlowLayout
import java.awt.Font
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.JTabbedPane
import javax.swing.JTable
import javax.swing.JTextArea
import javax.swing.table.DefaultTableModel

/** Read-only response viewer: status bar plus Body/Headers/Cookies tabs. */
class ResponsePanel : JPanel(BorderLayout()) {
  private val statusLabel = JLabel("No response")
  private val metaLabel = JLabel("")
  private val bodyArea = JTextArea()
  private val prettyButton = JButton("Raw")
  private val headersModel = readOnlyModel("Name", "Value")
  private val cookiesModel = readOnlyModel("Name", "Value", "Domain", "Path")

  private var current: HttpResponse? = null
  private var pretty = true

  init {
    add(buildStatusBar(), BorderLayout.NORTH)
    bodyArea.isEditable = false
    bodyArea.font = Font(Font.MONOSPACED, Font.PLAIN, 12)

    val tabs = JTabbedPane()
    tabs.addTab("Body", buildBodyPanel())
    tabs.addTab("Headers", JScrollPane(JTable(headersModel)))
    tabs.addTab("Cookies", JScrollPane(JTable(cookiesModel)))
    add(tabs, BorderLayout.CENTER)

    prettyButton.addActionListener {
      pretty = !pretty
      prettyButton.text = if (pretty) "Raw" else "Pretty"
      renderBody()
    }
  }

  private fun buildStatusBar(): JPanel {
    val panel = JPanel(FlowLayout(FlowLayout.LEFT))
    panel.add(statusLabel)
    panel.add(metaLabel)
    return panel
  }

  private fun buildBodyPanel(): JPanel {
    val panel = JPanel(BorderLayout())
    val top = JPanel(FlowLayout(FlowLayout.LEFT))
    top.add(prettyButton)
    panel.add(top, BorderLayout.NORTH)
    panel.add(JScrollPane(bodyArea), BorderLayout.CENTER)
    return panel
  }

  fun showLoading() {
    statusLabel.text = "Sending…"
    statusLabel.foreground = UIManagerForeground()
    metaLabel.text = ""
    bodyArea.text = ""
    clearTables()
  }

  fun showError(message: String) {
    statusLabel.text = "Error"
    statusLabel.foreground = Color(0xF8, 0x51, 0x49)
    metaLabel.text = ""
    bodyArea.text = message
    clearTables()
  }

  fun show(response: HttpResponse) {
    current = response
    statusLabel.text = "${response.status} ${response.statusText}".trim()
    statusLabel.foreground = statusColor(response.status)
    metaLabel.text = "   ${response.timings.durationMs} ms   ${formatBytes(response.sizeBytes)}" +
      (response.contentType?.let { "   $it" } ?: "")

    clearTables()
    response.headers.forEach { headersModel.addRow(arrayOf(it.key, it.value)) }
    response.cookies.forEach {
      cookiesModel.addRow(arrayOf(it.name, it.value, it.domain ?: "", it.path ?: ""))
    }
    renderBody()
  }

  private fun renderBody() {
    val response = current ?: return
    bodyArea.text = when {
      response.bodyBase64 != null -> "[binary response · ${formatBytes(response.sizeBytes)}]"
      pretty -> prettyPrint(response.bodyText, response.contentType)
      else -> response.bodyText
    }
    bodyArea.caretPosition = 0
  }

  private fun clearTables() {
    headersModel.rowCount = 0
    cookiesModel.rowCount = 0
  }

  private fun prettyPrint(body: String, contentType: String?): String {
    val looksJson = contentType?.contains("json") == true ||
      body.trimStart().startsWith("{") || body.trimStart().startsWith("[")
    if (!looksJson) return body
    return runCatching {
      val json = kotlinx.serialization.json.Json { prettyPrint = true }
      json.encodeToString(
        kotlinx.serialization.json.JsonElement.serializer(),
        kotlinx.serialization.json.Json.parseToJsonElement(body),
      )
    }.getOrElse { body }
  }

  private fun statusColor(status: Int): Color = when {
    status in 200..299 -> Color(0x3F, 0xB9, 0x50)
    status >= 400 -> Color(0xF8, 0x51, 0x49)
    else -> Color(0xD2, 0x99, 0x22)
  }

  private fun formatBytes(bytes: Long): String = when {
    bytes < 1024 -> "$bytes B"
    bytes < 1024 * 1024 -> "%.1f KB".format(bytes / 1024.0)
    else -> "%.2f MB".format(bytes / (1024.0 * 1024.0))
  }

  private fun UIManagerForeground(): Color =
    javax.swing.UIManager.getColor("Label.foreground") ?: Color.GRAY

  private fun readOnlyModel(vararg columns: String): DefaultTableModel =
    object : DefaultTableModel(columns, 0) {
      override fun isCellEditable(row: Int, column: Int): Boolean = false
    }
}
