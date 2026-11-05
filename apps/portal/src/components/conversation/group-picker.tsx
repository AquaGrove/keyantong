"use client";

import { useEffect, useRef, useState } from "react";
import { useConversation } from "./provider";

export function SampleGroupPicker({ picker }: { picker: NonNullable<ReturnType<typeof useConversation>["groupPicker"]> }) {
  const { saveGroups, closeGroupPicker, busy } = useConversation();
  const [values, setValues] = useState(new Map<string, "control" | "treatment">());
  const [checked, setChecked] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const control = picker.samples.filter(sample => values.get(sample) === "control").length;
  const treatment = picker.samples.filter(sample => values.get(sample) === "treatment").length;
  const remaining = picker.samples.length - control - treatment;
  const problem = remaining
    ? `还有 ${remaining} 个样本未分组。`
    : control < 2 || treatment < 2 ? "对照组和实验组各至少需要 2 个样本。" : "";

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} className="conversation-group-dialog" aria-labelledby="group-picker-title"
      onCancel={event => { event.preventDefault(); closeGroupPicker(); }}>
      <form className="conversation-group-picker" onSubmit={event => {
        event.preventDefault();
        setChecked(true);
        if (problem) {
          dialog.current?.querySelector<HTMLSelectElement>('select[data-unassigned="true"]')?.focus();
          return;
        }
        saveGroups(picker, Object.fromEntries(values));
      }}>
        <header className="conversation-group-heading">
          <div><small>RNAseq · 实验设计</small><h2 id="group-picker-title">为样本分组</h2></div>
          <button type="button" aria-label="关闭分组" onClick={closeGroupPicker}>×</button>
        </header>
        <div className="conversation-group-counts">
          <span>对照组 <strong>{control}</strong></span>
          <span>实验组 <strong>{treatment}</strong></span>
          <span>待分组 <strong>{remaining}</strong></span>
        </div>
        <div className="conversation-group-samples">
          {picker.samples.map((sample, index) => (
            <label key={sample}>
              <span><small>{index + 1}</small> {sample}</span>
              <select data-unassigned={!values.has(sample)} value={values.get(sample) || ""} onChange={event => {
                const value = event.currentTarget.value;
                setValues(previous => {
                  const next = new Map(previous);
                  if (value === "control" || value === "treatment") next.set(sample, value);
                  else next.delete(sample);
                  return next;
                });
              }}>
                <option value="">请选择</option>
                <option value="control">对照组</option>
                <option value="treatment">实验组</option>
              </select>
            </label>
          ))}
        </div>
        <p className={checked && problem ? "conversation-group-error" : ""} aria-live="polite">
          {problem || "已满足分组要求。保存后将更新当前任务的分组配置。"}
        </p>
        <div className="conversation-group-actions">
          <button type="button" onClick={closeGroupPicker}>取消</button>
          <button type="submit" disabled={busy}>保存分组</button>
        </div>
      </form>
    </dialog>
  );
}
