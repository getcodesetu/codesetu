package ai.codesetu.apiclient.ui

import ai.codesetu.apiclient.model.KeyValue
import javax.swing.table.AbstractTableModel

/**
 * Editable table model backing a list of KeyValue rows, with an always-present
 * trailing blank row that materializes a new entry when edited.
 */
class KeyValueTableModel(initial: List<KeyValue>) : AbstractTableModel() {
  private val rows = initial.toMutableList()
  var onChange: () -> Unit = {}

  override fun getRowCount(): Int = rows.size + 1

  override fun getColumnCount(): Int = 3

  override fun getColumnName(column: Int): String = when (column) {
    0 -> ""
    1 -> "Key"
    2 -> "Value"
    else -> ""
  }

  override fun getColumnClass(column: Int): Class<*> =
    if (column == 0) java.lang.Boolean::class.java else String::class.java

  override fun isCellEditable(row: Int, column: Int): Boolean = true

  override fun getValueAt(row: Int, column: Int): Any {
    if (row >= rows.size) {
      return if (column == 0) true else ""
    }
    val entry = rows[row]
    return when (column) {
      0 -> entry.enabled
      1 -> entry.key
      2 -> entry.value
      else -> ""
    }
  }

  override fun setValueAt(value: Any?, row: Int, column: Int) {
    if (row >= rows.size) {
      rows.add(KeyValue(enabled = true))
    }
    val entry = rows[row]
    rows[row] = when (column) {
      0 -> entry.copy(enabled = value as? Boolean ?: true)
      1 -> entry.copy(key = value as? String ?: "")
      2 -> entry.copy(value = value as? String ?: "")
      else -> entry
    }
    fireTableRowsUpdated(row, row)
    if (row == rows.size - 1) {
      fireTableRowsInserted(rows.size, rows.size)
    }
    onChange()
  }

  /** Returns the non-empty rows. */
  fun snapshot(): List<KeyValue> = rows.filter { it.key.isNotEmpty() || it.value.isNotEmpty() }
}
