/**
 * Copyright 2026 CodeSetu Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * See the repository LICENSE for details.
 */

import type { KeyValue } from "@codesetu/api-client-core/model";

export interface TabDescriptor {
  id: string;
  label: string;
  badge?: number;
}

export function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabDescriptor[];
  active: string;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? "tab tab--active" : "tab"}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
          {tab.badge ? <span className="tab__badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Editable table of key/value rows with an always-present trailing blank row. */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: {
  rows: KeyValue[];
  onChange: (rows: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}): JSX.Element {
  const display = [...rows, blankRow()];

  const commit = (next: KeyValue[]): void => {
    onChange(next.filter((row, index) => index < next.length && (row.key !== "" || row.value !== "")));
  };

  const updateRow = (index: number, patch: Partial<KeyValue>): void => {
    const next = display.map((row, i) => (i === index ? { ...row, ...patch } : row));
    commit(next);
  };

  const removeRow = (index: number): void => {
    commit(display.filter((_, i) => i !== index));
  };

  return (
    <table className="kv">
      <tbody>
        {display.map((row, index) => {
          const isBlank = index === display.length - 1;
          return (
            <tr key={index} className={row.enabled ? "kv__row" : "kv__row kv__row--disabled"}>
              <td className="kv__toggle">
                {!isBlank && (
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) => updateRow(index, { enabled: event.target.checked })}
                    aria-label="Enabled"
                  />
                )}
              </td>
              <td>
                <input
                  className="kv__input"
                  value={row.key}
                  placeholder={keyPlaceholder}
                  onChange={(event) =>
                    updateRow(index, {
                      key: event.target.value,
                      ...(isBlank ? { enabled: true } : {}),
                    })
                  }
                />
              </td>
              <td>
                <input
                  className="kv__input"
                  value={row.value}
                  placeholder={valuePlaceholder}
                  onChange={(event) =>
                    updateRow(index, {
                      value: event.target.value,
                      ...(isBlank ? { enabled: true } : {}),
                    })
                  }
                />
              </td>
              <td className="kv__remove">
                {!isBlank && (
                  <button type="button" className="icon-button" onClick={() => removeRow(index)}>
                    ×
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function blankRow(): KeyValue {
  return { key: "", value: "", enabled: true };
}
