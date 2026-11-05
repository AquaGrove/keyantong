/** Portal checklist state machine (mirrors services/ncbi-upload portal_checklist.py).
 * Honest policy: NO Submission Portal browser automation.
 */

export type ChecklistStepId =
  | "validate"
  | "dry_run"
  | "ascp_upload"
  | "portal_login"
  | "bioproject"
  | "biosample"
  | "sra_submit"
  | "accessions";

export type ChecklistStep = {
  id: ChecklistStepId;
  label: string;
  done: boolean;
  kind: "auto" | "manual";
  hint: string;
};

export const CHECKLIST_STEPS: Omit<ChecklistStep, "done">[] = [
  {
    id: "validate",
    label: "字段与文件清单校验通过",
    kind: "auto",
    hint: "本工具自动：元数据 / 文件名 / ascp 路径校验",
  },
  {
    id: "dry_run",
    label: "本机 ascp dry-run 成功",
    kind: "manual",
    hint: "Dry-run：只检查路径与命令，不实际上传",
  },
  {
    id: "ascp_upload",
    label: "本机 ascp 实际上传成功",
    kind: "manual",
    hint: "真实运行：对本机执行 ascp；密钥不落库",
  },
  {
    id: "portal_login",
    label: "用户已在浏览器登录 Submission Portal",
    kind: "manual",
    hint: "使用本机已登录浏览器；登录验证由用户完成",
  },
  {
    id: "bioproject",
    label: "用户已创建/选择 BioProject",
    kind: "manual",
    hint: "本机浏览器助手代填已支持字段后核对",
  },
  {
    id: "biosample",
    label: "用户已创建 BioSample 并粘贴校验字段",
    kind: "manual",
    hint: "本机浏览器助手代填已支持字段后核对",
  },
  {
    id: "sra_submit",
    label: "用户已创建 SRA submission 并关联文件",
    kind: "manual",
    hint: "本机浏览器助手代填已支持字段后核对",
  },
  {
    id: "accessions",
    label: "用户已保存 Accession",
    kind: "manual",
    hint: "本机浏览器助手代填已支持字段后核对",
  },
];

export function emptyChecklist(doneIds: ChecklistStepId[] = []): {
  automation_policy: string;
  steps: ChecklistStep[];
  next: ChecklistStepId | null;
  notes: Record<string, string>;
} {
  const done = new Set(doneIds);
  const steps: ChecklistStep[] = CHECKLIST_STEPS.map((s) => ({
    ...s,
    done: done.has(s.id),
  }));
  const next = (steps.find((s) => !s.done)?.id ||
    null) as ChecklistStepId | null;
  return {
    automation_policy: "local_browser_assistance",
    steps,
    next,
    notes: {},
  };
}

export function checklistFromRunner(
  status?: {
    status?: string;
    ok?: boolean;
    command?: string | null;
    message?: string;
  } | null,
) {
  const done: ChecklistStepId[] = [];
  const notes: Record<string, string> = {};
  if (!status) return { ...emptyChecklist(), notes };
  const st = String(status.status || "");
  if (status.command || ["dry_run", "succeeded", "running"].includes(st)) {
    done.push("validate");
    notes.validate = "from runner / validate";
  }
  if (st === "dry_run" && status.ok) {
    done.push("dry_run");
    notes.dry_run = status.message || "dry_run ok";
  }
  if (st === "succeeded" && status.ok) {
    if (!done.includes("dry_run")) done.push("dry_run");
    done.push("ascp_upload");
    notes.ascp_upload = status.message || "ascp ok";
  }
  const base = emptyChecklist(done);
  return { ...base, notes };
}
