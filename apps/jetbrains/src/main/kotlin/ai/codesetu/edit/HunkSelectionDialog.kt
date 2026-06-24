package ai.codesetu.edit

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBScrollPane
import java.awt.Dimension
import javax.swing.BoxLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * A checkbox list of an edit's hunks (all pre-selected) for per-hunk
 * accept/reject. Mirrors the VS Code multi-select picker.
 */
class HunkSelectionDialog(project: Project, private val hunks: List<DiffHunk>) : DialogWrapper(project) {
  private val checkBoxes = ArrayList<JBCheckBox>()

  init {
    title = "Choose hunks to apply"
    init()
  }

  override fun createCenterPanel(): JComponent {
    val panel = JPanel()
    panel.layout = BoxLayout(panel, BoxLayout.Y_AXIS)
    hunks.forEachIndexed { index, hunk ->
      val label =
        "Hunk ${index + 1}  (−${hunk.oldLines.size} +${hunk.newLines.size})  ${preview(hunk)}"
      val box = JBCheckBox(label, true)
      checkBoxes.add(box)
      panel.add(box)
    }
    val scroll = JBScrollPane(panel)
    scroll.preferredSize = Dimension(620, minOf(420, 48 + hunks.size * 28))
    return scroll
  }

  /** Indices of hunks the user chose to keep. */
  fun acceptedIndices(): Set<Int> =
    checkBoxes.withIndex().filter { it.value.isSelected }.map { it.index }.toSet()

  private fun preview(hunk: DiffHunk): String {
    val removed = hunk.oldLines.firstOrNull()?.trim()?.let { "− $it" } ?: ""
    val added = hunk.newLines.firstOrNull()?.trim()?.let { "+ $it" } ?: ""
    return listOf(removed, added).filter { it.isNotEmpty() }.joinToString("   ").take(80)
  }
}
