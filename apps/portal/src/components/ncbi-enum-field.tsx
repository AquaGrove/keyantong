"use client";

import { useId, useMemo, useState } from "react";
import { OTHER_VALUE, type VocabOption } from "@/lib/tools/ncbi-vocab";

function grouped(options: VocabOption[]) {
  const map = new Map<string, VocabOption[]>();
  for (const o of options) {
    const g = o.group || "选项";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(o);
  }
  return [...map.entries()];
}

/** Select from NCBI vocab; optional「其他」opens free-text. */
export function NcbiEnumField({
  label,
  value,
  onChange,
  options,
  required,
  allowOther = true,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: VocabOption[];
  required?: boolean;
  allowOther?: boolean;
  hint?: string;
}) {
  const known = useMemo(() => new Set(options.map((o) => o.value)), [options]);
  const [useOther, setUseOther] = useState(() => Boolean(value) && !known.has(value));
  const groups = useMemo(() => grouped(options), [options]);
  const selectValue = useOther || (value !== "" && !known.has(value)) ? OTHER_VALUE : value;

  return (
    <label className="ncbi-enum-field">
      {label}
      <select
        value={selectValue}
        required={required && !(useOther || (value !== "" && !known.has(value)))}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER_VALUE) {
            setUseOther(true);
            if (known.has(value)) onChange("");
            return;
          }
          setUseOther(false);
          onChange(v);
        }}
      >
        <option value="" disabled>
          请选择…
        </option>
        {groups.map(([g, items]) => (
          <optgroup key={g} label={g}>
            {items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label || o.value}
              </option>
            ))}
          </optgroup>
        ))}
        {allowOther ? <option value={OTHER_VALUE}>其他（手填）…</option> : null}
      </select>
      {useOther || (value !== "" && !known.has(value)) ? (
        <input
          className="ncbi-enum-other"
          value={value}
          required={required}
          placeholder="输入 NCBI 接受的自定义值"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : null}
      {hint ? <span className="form-note">{hint}</span> : null}
    </label>
  );
}

/**
 * Organism: quick-pick common species + always-available searchable free text (datalist).
 */
export function NcbiOrganismField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: VocabOption[];
  required?: boolean;
}) {
  const listId = useId();
  const known = useMemo(() => new Set(options.map((o) => o.value)), [options]);
  const groups = useMemo(() => grouped(options), [options]);

  return (
    <label className="ncbi-enum-field">
      {label}
      <select
        value={known.has(value) ? value : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange(v);
        }}
        aria-label={`${label} 常用列表`}
      >
        <option value="">{known.has(value) ? "改选常用物种…" : "从常用物种选择…"}</option>
        {groups.map(([g, items]) => (
          <optgroup key={g} label={g}>
            {items.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label || o.value}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <input
        list={listId}
        value={value}
        required={required}
        placeholder="或输入/搜索学名，如 Oryza sativa"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label || o.value}
          </option>
        ))}
      </datalist>
      <span className="form-note">可用下拉选常用物种，或在输入框联想/手填 NCBI Taxonomy 学名。</span>
    </label>
  );
}
