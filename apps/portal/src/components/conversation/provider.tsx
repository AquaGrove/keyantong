"use client";
import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { fileMarkers } from "@/lib/agent/types";
import type {
  AgentContext,
  AgentCommand,
  AgentReply,
  Workspace,
} from "@/lib/agent/types";
import { terminal, type JobReceipt, type Download } from "@/lib/agent/receipts";
import { relayRequest, stageFastq, type RelayBatch } from "./ncbi-relay";
import { taskFiles, type LocalTaskData } from "./task-files";
import { assistantDownload, fileNameReference, localOperation, localPaths, readLocalFile, redactLocalPaths } from "./local-files";
import {
  fastq, folderPath, inventoryFromFiles, mergeUploadFields, missingUploadField,
  pairFiles, uploadPayload, type SequenceInventory, type UploadDraft, type UploadTask,
} from "./sequencing";
export type Message = { id: string; role: "user" | "assistant"; text: string; download?: Download };
export type Attachment = Omit<NonNullable<AgentContext["attachments"]>[number], "name" | "size"> & { file: File };
type Identity = { id: string; entitled: boolean } | null;
type AuthFlow = {
  mode: "login" | "register" | "verify";
  step: "email" | "password" | "code" | "replace";
  replaceOldest?: boolean;
  email?: string;
  username?: string;
};
type GroupPicker = { matrixId: string; samples: string[] };
type GroupRole = "control" | "treatment";
type TaskEntry = { id: string; title: string; version: number; updated_at: string };
type TaskSnapshot = { messages: Message[]; context: AgentContext; jobIds: string[]; pendingJobs?: string[] };
type AgentState = {
  tasks: TaskEntry[];
  activeTask: string | null;
  taskNotice: string;
  switchTask: (id?: string) => Promise<void>;
  groupPicker: GroupPicker | null;
  saveGroups: (picker: GroupPicker, values: Record<string, GroupRole>) => void;
  closeGroupPicker: () => void;
  messages: Message[];
  busy: boolean;
  input: string;
  setInput: (s: string) => void;
  send: (s?: string) => Promise<void>;
  context: AgentContext;
  setContext: (c: Partial<AgentContext>) => void;
  files: Attachment[];
  addFiles: (f: File[]) => Promise<void>;
  user: Identity;
  authFlow: AuthFlow | null;
  revision: number;
  announce: (s: string, download?: Download) => void;
  report: (key: string, text: string) => void;
};
const State = createContext<AgentState | null>(null);
const lastTaskKey = (actor: string) => "kt-agent:active-task:" + actor;
const uid = () => crypto.randomUUID();
const ncbiWebUpload = "在 [NCBI SRA 提交页面](https://submit.ncbi.nlm.nih.gov/subs/sra/) 登录后，少量小文件可在 Files 步骤选择 HTTP。批量数据可按 [NCBI 官方说明](https://www.ncbi.nlm.nih.gov/sra/docs/submitfiles/) 从本机用 Aspera 命令行预上传，再回到 NCBI 选择提交目录。";
const welcome =
  "你好，我在。告诉我你正在研究什么，或想解决什么问题。文件可以直接拖进来，我们一起把下一步完成。";
async function jsonFetch(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: "same-origin", ...init });
  const d = await r.json().catch(() => ({ error: "暂时没有收到可用的响应。" }));
  if (!r.ok)
    throw Object.assign(new Error(d.error || "这一步暂未完成，请稍后重试。"), {
      code: d.code,
      details: d,
    });
  return d;
}
function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\t")) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export function ConversationProvider({
  children,
  identity,
}: {
  children: ReactNode;
  identity: Identity;
}) {
  const [restoring, setRestoring] = useState(!!identity);
  const [groupPicker, setGroupPicker] = useState<GroupPicker | null>(null);
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskEntry[]>([]);
  const [activeTask, setActiveTask] = useState<string | null>(null);
  const [taskNotice, setTaskNotice] = useState("");
  const task = useRef<{id:string; version:number} | null>(null);
  const jobIds = useRef<string[]>([]);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const savedTask = useRef<string | null>(null);
  const savedFiles = useRef<Attachment[] | null>(null);
  const savedUpload = useRef("");
  const taskEpoch = useRef(0);
  const unavailableFiles = useRef<NonNullable<AgentContext["attachments"]>>([]);

  const [messages, setMessages] = useState<Message[]>([
      { id: "welcome", role: "assistant", text: welcome },
    ]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [contextState, setContextState] = useState<AgentContext>({
      workspace: "home",
    }),
    [files, setFiles] = useState<Attachment[]>([]),
    [user, setUser] = useState(identity),
    [authFlow, setAuthFlow] = useState<AuthFlow | null>(null),
    [revision, setRevision] = useState(0),
    [tracked, setTracked] = useState<string[]>([]);
  const relayFiles = useRef<File[]>([]);
  const uploadDraft = useRef<UploadDraft | null>(null);
  const waitingForFolder = useRef(false);
  const lastUploadTaskId = useRef<string | null>(null);
  const contextRef = useRef(contextState),
    filesRef = useRef(files),
    pending = useRef<{ ticket: string; phrase: string } | null>(null),
    locked = useRef(false),
    storageReady = useRef(false),
    owner = useRef(identity?.id || "guest"),
    requestedRead = useRef<string | null>(null),
    trackedStatus = useRef(new Map<string, string>()),
    resourceIndex = useRef<{ name: string; id: string; url: string }[]>([]);
  function scopedFetch(url: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("x-keyantong-actor", user?.id || "guest");
    return jsonFetch(url, { ...init, headers });
  }

  function clearPrivateState() {
    taskEpoch.current++;
    task.current = null;
    jobIds.current = [];
    savedTask.current = null;
    savedFiles.current = null;
    savedUpload.current = "";
    unavailableFiles.current = [];
    setActiveTask(null);
    setTaskNotice("");
    try { sessionStorage.removeItem("kt-agent:v1:" + owner.current); } catch {}
    setMessages([{ id: uid(), role: "assistant", text: welcome }]);
    setFiles([]);
    setGroupPicker(null);
    filesRef.current = [];
    contextRef.current = { workspace: "home" };
    setContextState(contextRef.current);
    setInput("");
    setAuthFlow(null);
    pending.current = null;
    requestedRead.current = null;
    uploadDraft.current = null;
    relayFiles.current = [];
    waitingForFolder.current = false;
    lastUploadTaskId.current = null;
    trackedStatus.current.clear();
    setTracked([]);
  }

  function saveTask() {
    const actor = user?.id;
    if (!actor || owner.current !== actor || (!messages.some(message => message.role === "user") && !files.length && !uploadDraft.current && !task.current))
      return Promise.resolve();
    const current = task.current || {id:uid(), version:0};
    if (!task.current) {
      task.current = current;
      setActiveTask(current.id);
    }
    const snapshot: TaskSnapshot = {
      messages: messages.slice(-80),
      context: {
        ...contextRef.current,
        attachments: [
          ...(contextRef.current.attachments || []),
          ...unavailableFiles.current.filter(missing => !filesRef.current.some(file => file.file.name === missing.name && file.role === missing.role)),
        ],
      },
      jobIds: jobIds.current.slice(-100),
      pendingJobs: tracked,
    };
    const title = (snapshot.messages.find(message => message.role === "user")?.text || files[0]?.file.name || "新任务")
      .replace(/\s+/g, " ").slice(0, 100);
    const serialized = JSON.stringify(snapshot);
    const attachments = filesRef.current;
    const local: LocalTaskData = {
      files: attachments,
      upload: structuredClone(uploadDraft.current),
      waitingForFolder: waitingForFolder.current,
      transferId: lastUploadTaskId.current,
    };
    const localStamp = JSON.stringify([local.upload, local.waitingForFolder, local.transferId]);
    const write = writes.current.catch(() => {}).then(async () => {
      if (owner.current !== actor || task.current !== current) return;
      let localWarning = "";
      if (savedTask.current !== serialized) {
        const result: {task:TaskEntry} = await scopedFetch("/api/agent/history", {
          method:"PUT",
          headers:{"content-type":"application/json"},
          body:JSON.stringify({id:current.id,version:current.version,title,snapshot}),
        });
        if (owner.current !== actor || task.current !== current) return;
        current.version = result.task.version;
        try { sessionStorage.setItem(lastTaskKey(actor), current.id); } catch {}
        savedTask.current = serialized;
        setTasks(old => [result.task, ...old.filter(entry => entry.id !== current.id)].slice(0,100));
      }
      if (savedFiles.current !== attachments || savedUpload.current !== localStamp) {
        try {
          await taskFiles(actor, current.id, local);
          if (owner.current !== actor || task.current !== current) return;
          savedFiles.current = attachments;
          savedUpload.current = localStamp;
        }
        catch { localWarning = "附件未能保存在此浏览器，下次需要重新选择。"; }
      }
      if (owner.current !== actor || task.current !== current) return;
      setTaskNotice(localWarning || "已保存");
    });
    writes.current = write;
    return write;
  }

  async function switchTask(id?: string) {
    const actor = user?.id;
    if (!actor || locked.current || authFlow || (id && id === activeTask)) return;
    locked.current = true;
    setBusy(true);
    try {
      await saveTask();
      const data = id
        ? await scopedFetch("/api/agent/history?id=" + encodeURIComponent(id)) as {task:TaskEntry & {snapshot:TaskSnapshot}}
        : null;
      let local: LocalTaskData | undefined;
      if (id) {
        try { local = await taskFiles(actor, id); } catch {}
      }
      let restored = local?.files || [];
      if (owner.current !== actor) return;
      clearPrivateState();
      try { sessionStorage.setItem(lastTaskKey(actor), id || "new"); } catch {}
      if (!data) return;
      const entry = data.task;
      const expected = new Set((entry.snapshot.context.attachments || []).map(file => file.id));
      restored = restored.filter(file => expected.has(file.id));
      unavailableFiles.current = (entry.snapshot.context.attachments || []).filter(file => !restored.some(entry => entry.id === file.id));
      task.current = {id:entry.id, version:entry.version};
      jobIds.current = entry.snapshot.jobIds;
      setTracked((entry.snapshot.pendingJobs || []).filter(id => entry.snapshot.jobIds.includes(id)).slice(-8));
      setActiveTask(entry.id);
      setMessages(entry.snapshot.messages);
      contextRef.current = {...entry.snapshot.context, attachments: []};
      setContextState(contextRef.current);
      filesRef.current = restored;
      savedFiles.current = restored;
      uploadDraft.current = local?.upload || null;
      waitingForFolder.current = !!local?.waitingForFolder;
      lastUploadTaskId.current = local?.transferId || null;
      setFiles(restored);
      setTaskNotice(restored.length === expected.size
        ? "已恢复任务"
        : "对话已恢复。附件保存在原浏览器，这里需要重新选入。");
    } catch (error) {
      if (owner.current === actor) setTaskNotice(error instanceof Error ? error.message : "无法切换任务。");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user) { setTasks([]); setRestoring(false); return; }
    setRestoring(true);
    let live = true;
    const actor = user.id;
    void scopedFetch("/api/agent/history")
      .then(async (data: {tasks: TaskEntry[]}) => {
        if (!live || owner.current !== actor) return;
        setTasks(data.tasks);
        let last: string | null = null;
        try { last = sessionStorage.getItem(lastTaskKey(actor)); } catch {}
        if (last === "new" || task.current || locked.current || filesRef.current.length) return;
        const entry = data.tasks.find(item => item.id === last) || data.tasks[0];
        if (entry) await switchTask(entry.id);
      })
      .catch(() => { if (live) setTaskNotice("暂时无法加载任务历史。"); })
      .finally(() => { if (live && owner.current === actor) setRestoring(false); });
    return () => { live = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user || busy || restoring || authFlow) return;
    const timer = setTimeout(() => {
      void saveTask().catch(error => setTaskNotice(error instanceof Error ? error.message : "任务暂未保存。"));
    }, 450);
    return () => clearTimeout(timer);
  }, [messages, files, contextState, user?.id, busy, restoring, authFlow, tracked]);

  const setContext = useCallback((c: Partial<AgentContext>) => {
    const old = contextRef.current;
    const next = { ...old, ...c };
    if (c.method && c.method !== old.method && !Object.hasOwn(c, "config")) {
      next.config = {};
      next.blockedReason = undefined;
    }
    contextRef.current = next;
    setContextState(next);
  }, []);
  const announce = useCallback((text: string, download?: Download) => {
    if (text)
      setMessages((m) => [
        ...m.slice(-79),
        { id: uid(), role: "assistant", text, download },
      ]);
  }, []);
  const report = useCallback((key: string, text: string) => {
    if (requestedRead.current !== key) return;
    requestedRead.current = null;
    announce(text);
  }, [announce]);
  const track = (id: string) => {
    jobIds.current = [...jobIds.current.filter(value => value !== id), id].slice(-100);
    setTracked(old => [...old.filter(x => x !== id),id].slice(-8));
  };
  useEffect(() => {
    if (!user || !tracked.length) return;
    const actor = user.id;
    const controller = new AbortController();
    const query = new URLSearchParams(tracked.map(id => ["id",id]));
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const d: {jobs:JobReceipt[]} = await scopedFetch("/api/agent/jobs?" + query, {signal:controller.signal});
        if (controller.signal.aborted || owner.current !== actor) return;
        const done = new Set<string>();
        for (const j of d.jobs) {
          if (trackedStatus.current.get(j.id) !== j.status && (j.status === "running" || terminal(j.status)))
            announce(j.text,j.download);
          trackedStatus.current.set(j.id,j.status);
          if (terminal(j.status)) done.add(j.id);
        }
        if (done.size) {
          for (const id of done) trackedStatus.current.delete(id);
          setTracked(old => old.filter(id => !done.has(id)));
          setRevision(v => v+1);
          return;
        }
      } catch {}
      if (!controller.signal.aborted) timer = setTimeout(poll, 6500);
    }
    void poll();
    return () => {controller.abort();clearTimeout(timer);};
  }, [tracked,user?.id,announce]);
  useEffect(() => {
    filesRef.current = files;
    setContext({
      attachments: files.map((f) => ({
        id: f.id,
        name: f.file.name,
        size: f.file.size,
        role: f.role,
        evidence: f.evidence,
      })),
    });
  }, [files, setContext]);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("kt-agent:v1:" + owner.current) || "null",
      );
      if (Array.isArray(saved?.messages))
        setMessages(
          saved.messages
            .slice(-80)
            .filter(
              (m: Message) =>
                m &&
                ["user", "assistant"].includes(m.role) &&
                typeof m.text === "string",
            ),
        );
    } catch {}
    storageReady.current = true;
    void fetch("/api/resources")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.resources)
          resourceIndex.current = d.resources.map((r: any) => ({
            name: r.content.name,
            id: r.id,
            url: r.url,
          }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (storageReady.current && owner.current === "guest")
      try {
        sessionStorage.setItem(
          "kt-agent:v1:" + owner.current,
          JSON.stringify({ messages: messages.slice(-80) }),
        );
      } catch {}
  }, [messages]);
  useEffect(() => {
    const nextOwner = identity?.id || "guest";
    if (owner.current !== nextOwner) { clearPrivateState(); setTasks([]); }
    setUser(identity);
    owner.current = nextOwner;
  }, [identity?.id, identity?.entitled]);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === "kt-account-changed") router.refresh();
    };
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, [router]);

  function signalAccountChange() {
    try { localStorage.setItem("kt-account-changed", uid()); } catch {}
    router.refresh();
  }
  function describeInventory(inventory: SequenceInventory, folder?: string) {
    if (!inventory.files.length) {
      announce("这一层没有找到 FASTQ/FQ 文件。请提供实际存放原始数据的那一层目录。");
      return;
    }
    const fields = uploadDraft.current?.fields || {};
    uploadDraft.current = { inventory, folder, fields };
    waitingForFolder.current = false;
    const { complete, incomplete, unknown } = pairFiles(inventory.files);
    const total = inventory.files.reduce((sum, file) => sum + file.size, 0);
    const preview = inventory.files.slice(0, 6).map(file => file.name).join("、");
    announce(
      `找到 ${inventory.files.length} 个 FASTQ 文件，共 ${(total / 1024 ** 2).toFixed(1)} MB。` +
      `按文件名识别出 ${complete} 对双端候选，${incomplete.length} 组缺端或重复，${unknown.length} 个文件没有端标记。\n` +
      `文件示例：${preview}。` +
      (inventory.ignored ? `目录还有 ${inventory.ignored} 项不属于 FASTQ。传输前需要一个只含本批 FASTQ 的专用目录。` : "") +
      (folder ? "" : "已通过浏览器核对文件清单。要免安装暂存，请说“确认暂存”。当前暂存额度为 2 GiB，保留 24 小时。") +
      "\n" + nextUploadPrompt(fields),
    );
  }

  function nextUploadPrompt(fields: Record<string, string>) {
    const missing = missingUploadField(fields);
    return missing
      ? `请告诉我${missing[1]}。你也可以一次发送多行“字段名：值”。`
      : "共同信息已齐。说“查看上传清单”核对，说“导出上传清单”保存文件对应关系，或说“准备上传”生成本机预检。各样本的组织、处理及 BioSample 对应关系还需在 NCBI 表中核对。";
  }

  async function handleUpload(text: string, folder?: string) {
    const actor = owner.current;
    if (/^(?:免安装上传|科研通暂存|准备暂存)[。！!]?$/i.test(text)) {
      announce("请在聊天框选择或拖入 FASTQ 文件，核对文件清单后说“确认暂存”。每个账号暂存额度为 2 GiB，保留 24 小时。此阶段文件存入科研通私有空间，状态停在暂存完成，NCBI 转交将在配置接收通道后开放。");
      waitingForFolder.current = true;
      return;
    }
    if (/^(?:确认暂存|继续暂存|查看暂存进度)[。！!]?$/i.test(text)) {
      if (actor === "guest") { announce("请先登录科研通，然后在当前任务选择 FASTQ 文件。"); return; }
      if (/^查看/.test(text)) {
        if (!task.current) { announce("当前任务还没有暂存批次。"); return; }
        const batch = await relayRequest<RelayBatch>("/api/ncbi/relay/" + task.current.id, actor);
        const sent = batch.files.reduce((sum, file) => sum + Math.min(file.size, file.hashes.length * 8 * 1024 ** 2), 0);
        announce(`科研通暂存${batch.complete ? "完成" : "进行中"}，已收到 ${(sent / 1024 ** 2).toFixed(1)} MiB。NCBI 尚未接收。`);
        return;
      }
      if (!relayFiles.current.length) { announce("请重新选择本批原始 FASTQ 文件，再说“继续暂存”。已校验的分片可以复用。"); return; }
      await saveTask();
      if (!task.current) throw new Error("请先保存当前任务。");
      const batch = await stageFastq(task.current.id, actor, relayFiles.current, (sent, total) => {
        if (owner.current === actor) setTaskNotice(`暂存中 ${Math.floor(sent * 100 / total)}%`);
      });
      if (owner.current !== actor) return;
      if (!batch.complete) throw new Error("仍有分片待上传，请说“继续暂存”。");
      setTaskNotice("科研通暂存完成");
      announce(`已在科研通私有空间暂存 ${batch.files.length} 个 FASTQ 文件，保留至 ${new Date(batch.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}。NCBI 尚未接收。`);
      return;
    }
    if (folder) {
      const inventory = await localOperation<SequenceInventory>("scan", { path: folder });
      if (owner.current === actor) describeInventory(inventory, folder);
      return;
    }
    if (/^(取消上传草稿|清除上传草稿)[。！]?$/.test(text)) {
      uploadDraft.current = null;
      relayFiles.current = [];
      waitingForFolder.current = false;
      announce("已清除当前上传草稿。本机已启动的任务仍可在本机助手查询。");
      return;
    }
    const draft = uploadDraft.current;
    if (/^(查看上传状态|上传进度)[。！]?$/.test(text)) {
      const taskId = draft?.task?.id || lastUploadTaskId.current;
      if (!taskId) { announce("还没有本机传输任务，请先说“准备上传”。"); return; }
      const status = await localOperation<UploadTask>("status", {request:{taskId}});
      if (owner.current !== actor) return;
      const labels: Record<string,string> = {awaiting_transfer_approval:"等待确认", starting:"正在启动", transferring:"传输中", transfer_failed:"传输失败", awaiting_ncbi_files:"传输完成，等待在 NCBI 核对文件并完成提交"};
      announce(`状态：${labels[status.state] || status.state}。${status.message || ""}`);
      return;
    }
    if (!draft) {
      waitingForFolder.current = true;
      announce("请用「选文件」多选 FASTQ，或拖入文件夹，我会核对文件名、大小和双端配对。已有本机助手也可粘贴目录路径。免安装暂存请先选入文件，再说“确认暂存”。直接去 NCBI 可说“用 NCBI 网页上传”。");
      return;
    }
    if (/^(查看上传清单|查看上传草稿)[。！]?$/.test(text)) {
      const summary = Object.values(draft.fields).join(" · ");
      const names = draft.inventory.files.slice(0, 25).map(file => file.name).join("\n");
      announce(`本批 ${draft.inventory.files.length} 个 FASTQ（最多显示前 25 个）：\n${names}\n已收集：${summary || "尚无元数据"}。\n${nextUploadPrompt(draft.fields)}`);
      return;
    }
    if (/^(确认上传|开始传输)[。！]?$/.test(text)) {
      if (!draft.task) { announce("请先说“准备上传”，核对目标和批次后再确认。"); return; }
      await localOperation<UploadTask>("start", {request:{taskId:draft.task.id, approval:draft.task.approval}});
      if (owner.current !== actor) return;
      lastUploadTaskId.current = draft.task.id;
      announce("已请求本机开始向 NCBI 传输。可以说“查看上传状态”查询进度。");
      return;
    }
    if (/^导出上传清单[。！]?$/.test(text)) {
      if (missingUploadField(draft.fields)) { announce(nextUploadPrompt(draft.fields)); return; }
      const payload = uploadPayload(draft);
      const cell = (value: string) => {
        const clean = value.replace(/[\t\r\n]/g, " ");
        return /^[=+@-]/.test(clean) ? "'" + clean : clean;
      };
      const rows = [
        ["候选样本名", "BioSample", "filename", "filename2", "library_layout", "platform", "instrument_model"],
        ...payload.runs.map(run => [run.sample, "", run.files[0], run.files[1] || "", draft.fields.layout, draft.fields.platform, draft.fields.model]),
      ];
      const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join("\t")).join("\n")], {type:"text/tab-separated-values;charset=utf-8"}));
      const link = document.createElement("a");
      link.href = url;
      link.download = "sra-file-mapping-draft.tsv";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce("已导出文件与候选样本的对应表。请补齐每个 BioSample，并将核对后的映射填入 NCBI 提供的模板。");
      return;
    }
    if (/^准备上传[。！]?$/.test(text)) {
      if (missingUploadField(draft.fields)) { announce(nextUploadPrompt(draft.fields)); return; }
      if (!draft.folder) { announce("如用本机助手传输，请粘贴该批 FASTQ 的完整目录路径。也可以说“用 NCBI 网页上传”。"); return; }
      const payload = uploadPayload(draft);
      if (new TextEncoder().encode(JSON.stringify(payload)).length > 240000)
        throw new Error("本批清单过大，请拆分为更小的上传批次。");
      draft.task = undefined;
      announce("正在本机核对文件并计算校验和。首次使用时，请在本机助手完成 NCBI 账户目录、密钥和 Aspera 配置。", {url:assistantDownload,label:"下载或更新科研通本机助手"});
      draft.task = await localOperation<UploadTask>("prepare", {path:draft.folder,request:{localFolder:draft.folder,payload}});
      if (owner.current !== actor) return;
      announce(`预检已完成。目标：${draft.task.destination}。本批共 ${draft.inventory.files.length} 个文件，${(draft.task.totalBytes / 1024 ** 2).toFixed(1)} MB。核对无误后说“确认上传”，再在浏览器确认传输。`);
      return;
    }
    if (/[?？]$/.test(text) || /^(继续|批量上传|我想批量上传)/.test(text)) {
      announce("本机预检和传输会发往你在 NCBI 配置的账户目录。" + nextUploadPrompt(draft.fields));
      return;
    }
    draft.fields = mergeUploadFields(draft.fields, text);
    draft.task = undefined;
    announce(nextUploadPrompt(draft.fields));
  }

  async function addFiles(incoming: File[]) {
    if (restoring) return;
    const actor = owner.current;
    const epoch = taskEpoch.current;
    if (incoming.some(file => fastq.test(file.name))) {
      relayFiles.current = incoming.filter(file => fastq.test(file.name));
      describeInventory(inventoryFromFiles(incoming));
      return;
    }
    const added: Attachment[] = [];
    for (const file of incoming.slice(0, 8 - filesRef.current.length)) {
      if (
        !/\.(csv|tsv|json)$/i.test(file.name) ||
        file.size > 80 * 1024 * 1024
      ) {
        announce(
          `${file.name} 不能作为当前输入。请使用 CSV、TSV 或 JSON 元数据；不要拖入密钥或 NCBI 原始测序文件。`,
        );
        continue;
      }
      const first = (await file.slice(0, 10000).text()).replace(/^\uFEFF/, "");
      if (/-----BEGIN.*PRIVATE KEY|"key_content"\s*:/i.test(first)) {
        announce(`${file.name} 含有密钥内容，请移除密钥后再提供元数据。该文件未上传。`);
        continue;
      }
      const parsed = csvRows(first);
      const header = (parsed[0] || []).map((x) =>
        x.trim().toLowerCase(),
      );
      let role = "unassigned";
      if (
        ["ref_high", "alt_high", "ref_low", "alt_low"].every((k) =>
          header.includes(k),
        )
      )
        role = "counts.csv";
      else if (
        ["id", "chrom", "pos", "ref", "alt"].every((k) => header.includes(k))
      )
        role = "genotypes.csv";
      else if (header.includes("sample") && header.includes("trait"))
        role = "phenotypes.csv";
      else if (header.includes("sample") && header.includes("group"))
        role = "groups";
      else if (/\.json$/i.test(file.name)) {
        try {
          const j = JSON.parse(first);
          if (j.groups || (j.version && j.options)) role = "groups";
          else if (j.bioproject || j.biosample) role = "ncbi-manifest";
        } catch {
          if (/analysis|group|分组/i.test(file.name)) role = "groups";
        }
      } else if (
        /gene|基因/i.test(header[0] || "") ||
        /matrix|counts|表达矩阵/i.test(file.name)
      )
        role = "matrix";
      const rows = file.size > 10000 && !/[\r\n]$/.test(first) ? parsed.slice(0, -1) : parsed;
      const values = rows.slice(1, 6).flatMap(row => row.slice(1)).filter(value => value.trim());
      const numbers = values.map(Number).filter(Number.isFinite);
      const fractional = numbers.filter(value => !Number.isInteger(value)).length;
      const unit = file.name.match(/(?:^|[_-])(tpm|fpkm)(?:[_.-]|$)/i)?.[1].toLowerCase() as "tpm" | "fpkm" | undefined;
      const saved = unavailableFiles.current.find(entry => entry.name === file.name && entry.size === file.size);
      const reference = contextRef.current.fileReference;
      const hint = reference?.name.toLowerCase() === file.name.toLowerCase() ? reference.role : undefined;
      const inspection = await scopedFetch("/api/agent", {
        method: "POST", headers: {"content-type":"application/json"},
        body: JSON.stringify({ inspect: {
          format: /\.json$/i.test(file.name) ? "json" : "table",
          columns: header.length, numeric: numbers.length, fractional, markers: fileMarkers.filter(marker => header.includes(marker) || (header.length === 1 && /\.json$/i.test(file.name) && first.includes('"' + marker + '"'))),
          unit, hint: hint || (role === "unassigned" ? undefined : role),
        } }),
      }).catch(() => null);
      if (owner.current !== actor || taskEpoch.current !== epoch) return;
      const inferred = inspection?.inspection?.role;
      role = saved?.role || (role !== "unassigned" && role !== "matrix" ? role : hint || (inferred && inferred !== "unassigned" ? inferred : role));
      added.push({
        id: saved?.id || uid(), file, role,
        evidence: { sampleColumns: Math.max(0, header.length - 1), unit, fractional: fractional > 0 },
      });
    }
    if (owner.current !== actor || taskEpoch.current !== epoch) return;
    const accepted = added.slice(0, 8 - filesRef.current.length);
    if (!accepted.length) return;
    unavailableFiles.current = unavailableFiles.current.filter(file => !accepted.some(entry => entry.id === file.id));
    if (accepted.some(entry => entry.file.name.toLowerCase() === contextRef.current.fileReference?.name.toLowerCase()))
      setContext({ fileReference: undefined });
    const nextFiles = [...filesRef.current, ...accepted];
    filesRef.current = nextFiles;
    setFiles(nextFiles);
    {
      const matrix = accepted.find((entry) => entry.role === "matrix");
      const hasGroups = nextFiles.some((entry) => entry.role === "groups");
      let next = "你可以补充参数，准备好后说“开始分析”。";
      if (accepted.some((entry) => entry.role === "unassigned")) {
        next = "有文件尚不能确定用途，你可以说“第几个文件是表达矩阵、分组、基因型或表型”。";
      } else if (matrix) {
        const columns = matrix.evidence?.sampleColumns || 0;
        if (!contextRef.current.method) setContext({ workspace: "analysis", method: "rnaseq" });
        next = `识别为表达矩阵。${columns ? `表头包含 ${columns} 个样本列。` : ""}`;
        next += hasGroups
          ? "表达矩阵和分组文件均已就绪。请核对对照组和比较，再说“开始分析”。"
          : "下一步可以说“选择分组”，我会按样本列生成分组选择器。也可以选入 sample、group 两列的分组表。";
        if (matrix.evidence?.unit || matrix.evidence?.fractional)
          next += "文件名或数值提示这可能是归一化表达量，请确认单位。DESeq2/edgeR 需要原始整数 counts。";
      }
      announce(`已读取 ${accepted.map((entry) => entry.file.name).join("、")}，已加入待处理文件。${next}`);
    }
  }
  async function authenticate(text: string) {
    const flow = authFlow!;
    if (flow.step === "email") {
      const account = text.trim().toLowerCase();
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account);
      const isUsername = /^[a-z0-9][a-z0-9_-]{2,29}$/.test(account);
      if ((flow.mode === "register" && !isUsername) || (!isUsername && !isEmail) ||
          (flow.mode === "verify" && !isEmail)) {
        announce(flow.mode === "register"
          ? "请输入 3–30 位用户名，可用字母、数字、下划线或短横线，并以字母或数字开头。"
          : "请输入用户名或已有账号的校园邮箱。");
        return;
      }
      setAuthFlow({
        ...flow,
        email: isEmail ? account : undefined,
        username: isUsername ? account : undefined,
        step: flow.mode === "verify" ? "code" : "password",
      });
      announce(
        flow.mode === "verify"
          ? "请输入收到的验证码。它不会保存在对话记录里。"
          : flow.mode === "register"
            ? "接下来输入至少 8 位密码。输入区已切换为隐私模式，密码不会进入对话或模型。"
            : "请输入密码。输入区已切换为隐私模式，密码不会进入对话或模型。",
      );
      return;
    }
    if (flow.step === "replace") {
      if (/替换|注销最旧|replace/i.test(text)) {
        setAuthFlow({ ...flow, step: "password", replaceOldest: true });
        announce(
          "我会注销最旧设备，再完成这次登录。请在隐私输入区重新输入密码。",
        );
      } else announce("你可以说“替换最旧设备”继续登录，或者说“取消”。");
      return;
    }
    if (flow.step === "password") {
      if (flow.mode === "register") {
        await jsonFetch("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: flow.username, password: text }),
        });
        setAuthFlow({ ...flow, mode: "login" });
      }
      await jsonFetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: flow.email,
          username: flow.username,
          password: text,
          deviceId: localDevice(),
          replaceOldest: flow.replaceOldest === true,
        }),
      });
      await finishLogin();
      return;
    }
    await jsonFetch("/api/auth/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: flow.email, code: text.trim() }),
    });
    setAuthFlow({ mode: "login", step: "password", email: flow.email });
    announce("验证完成。请再次在隐私输入区输入密码以登录。");
  }
  async function finishLogin() {
    const me = await jsonFetch("/api/me");
    if (!me.user) throw new Error("登录会话未建立，请重试。");
    clearPrivateState();
    owner.current = me.user.id;
    setRestoring(true);
    setUser({ id: me.user.id, entitled: me.user.entitled });
    announce("已登录。你可以告诉我这次的研究目标，或说“查看分析进度”查看这个账号的任务。");
    signalAccountChange();
  }
  function localDevice() {
    let id = sessionStorage.getItem("kt-device");
    if (!id) {
      id = uid();
      sessionStorage.setItem("kt-device", id);
    }
    return id;
  }
  async function runAnalysis(method: string) {
    if (!user) throw new Error("先告诉我“我要登录”，待处理文件会保留。");
    if (!user.entitled)
      throw new Error(
        "当前账号没有有效计算权益。你仍可查找资源、交流和贡献；需要我解释试用与会员规则吗？",
      );
    if (contextRef.current.blockedReason)
      throw new Error(contextRef.current.blockedReason);
    const fs = filesRef.current;
    const context = contextRef.current;
    const config = context.method === method ? context.config || {} : {};
    const form = new FormData();
    if (method === "rnaseq") {
      const matrix = fs.find((f) => f.role === "matrix"),
        groups = fs.find((f) => f.role === "groups");
      if (!matrix || !groups)
        throw new Error(
          "还需要表达矩阵和样本分组文件。请拖入文件，或告诉我已上传文件的用途。",
        );
      form.set("matrix", matrix.file);
      let groupFile = groups.file;
      if (
        config.engine ||
        config.lfc !== undefined ||
        config.padj !== undefined
      ) {
        let cfg: any;
        const raw = await groups.file.text();
        if (/\.json$/i.test(groups.file.name)) cfg = JSON.parse(raw);
        else {
          const rows = csvRows(raw),
            h = rows.shift()!.map((x) => x.trim().toLowerCase()),
            si = h.indexOf("sample"),
            gi = h.indexOf("group");
          if (si < 0 || gi < 0)
            throw new Error("分组文件须包含 sample 和 group 列。");
          const map = new Map<string, string[]>();
          for (const r of rows) {
            const name = r[gi]?.trim(),
              sample = r[si]?.trim();
            if (name && sample)
              map.set(name, [...(map.get(name) || []), sample]);
          }
          const entries = [...map];
          if (
            entries.length !== 2 ||
            !entries.some(([g]) => /^(control|ctrl|对照)$/i.test(g))
          )
            throw new Error(
              "请提供含对照组和对比设计的分组 JSON；我不会替你猜测复杂实验设计。",
            );
          const control = entries.find(([g]) =>
            /^(control|ctrl|对照)$/i.test(g),
          )![0];
          cfg = {
            version: 1,
            groups: entries.map(([g, samples]) => ({
              id: g,
              name: g,
              role: g === control ? "control" : "treatment",
              samples,
            })),
            options: {
              contrasts: entries
                .filter(([g]) => g !== control)
                .map(([g]) => ({
                  id: g + "_vs_" + control,
                  treatment: g,
                  control,
                })),
            },
          };
        }
        cfg.options = {
          ...(cfg.options || {}),
          ...(config.engine ? { de_engine: config.engine } : {}),
          ...(config.lfc !== undefined ? { lfc: config.lfc } : {}),
          ...(config.padj !== undefined ? { padj: config.padj } : {}),
        };
        groupFile = new File([JSON.stringify(cfg)], "analysis_config.json", {
          type: "application/json",
        });
      }
      form.set("groups", groupFile);
      form.set("species", String(config.species || "none"));
      if (config.lfc !== undefined) form.set("lfc", String(config.lfc));
      if (config.padj !== undefined) form.set("padj", String(config.padj));
      const d = await scopedFetch("/api/tools/rnaseq", {
        method: "POST",
        body: form,
      });
      track(d.job.id);
      announce("分析任务已入队。我会跟踪结果；你也可以继续问其他问题。");
    } else {
      const required =
        method === "gwas"
          ? ["genotypes.csv", "phenotypes.csv"]
          : ["counts.csv"];
      for (const name of required) {
        const f = fs.find((f) => f.role === name);
        if (!f)
          throw new Error(
            "还需要 " +
              (name === "genotypes.csv"
                ? "基因型"
                : name === "phenotypes.csv"
                  ? "表型"
                  : "双池等位计数") +
              " CSV 文件。",
          );
        form.set(name, f.file);
      }
      form.set(
        "method",
        method === "gwas" ? "gwas.plink-linear.v1" : "bsa.delta.v1",
      );
      form.set("config", JSON.stringify(config));
      form.set("acknowledged", "true");
      const d = await scopedFetch("/api/analysis/jobs", {
        method: "POST",
        body: form,
      });
      track(d.id);
      announce(
        d.reused
          ? "找到了相同文件和参数的任务，我会直接显示已有进度或结果。"
          : "文件已保存到你的私有空间，任务已入队。",
      );
    }
    setRevision((v) => v + 1);
  }
  async function execute(commands: AgentCommand[] = []) {
    for (const command of commands) {
      if (command.type === "jobs_status") {
        const actor = owner.current;
        if (!jobIds.current.length) {
          announce("这个对话还没有提交分析任务。要继续之前的任务，请从任务历史中打开对应对话。");
          return;
        }
        const query = new URLSearchParams(jobIds.current.slice(-8).map(id => ["id",id]));
        const d: {jobs:JobReceipt[]} = await scopedFetch("/api/agent/jobs?" + query);
        if (owner.current !== actor) return;
        if (!d.jobs.length) announce("还没有分析任务。可以告诉我你的研究目标，我会说明需要哪些文件。");
        for (const j of d.jobs.slice(0,5)) announce(j.text,j.download);
      }
      if (command.type === "navigate") {
        requestedRead.current = ["genomes","tools","papers","forum","post","account","notifications","workers","submissions"].includes(command.workspace) ? [command.workspace,command.query || "",command.id || ""].join(":") : null;
        if (requestedRead.current) setRevision(v => v+1);
        setContext({
          workspace: command.workspace,
          query: command.query || "",
          page: 0,
          items: [],
          graphSeed: undefined,
          ...(command.method ? { method: command.method as any } : {}),
          ...(command.workspace === "post" ? { postId: command.id } : {}),
        });
        if (command.workspace === "ncbi")
          announce("请粘贴 FASTQ 文件夹路径或把文件夹拖进聊天框，我会先核对文件清单。", {url: assistantDownload, label: "下载本机助手"});


      }
      if (command.type === "configure")
        setContext({ method: command.method as any, config: command.config });
      if (command.type === "run") await runAnalysis(command.method);
      if (command.type === "block_analysis")
        setContext({ blockedReason: command.reason });
      if (command.type === "page") {
        const c = contextRef.current;
        requestedRead.current = [c.workspace,c.query || "", ""].join(":");
        setRevision(v => v+1);
        setContext({
          page: Math.max(0, (contextRef.current.page || 0) + command.delta),
        });
      }
      if (command.type === "graph") {
        const c = contextRef.current;
        requestedRead.current = ["papers",c.query || "", ""].join(":");
        setRevision(v => v+1);
        setContext({
          graphSeed: command.seed || contextRef.current.graphSeed,
          graphMode: command.mode || "network",
        });
      }
      if (command.type === "refresh") {
        setRevision((v) => v + 1);
        router.refresh();
      }

      if (command.type === "files") {
        if (command.operation === "clear") unavailableFiles.current = [];
        setFiles((old) =>
          command.operation === "clear"
            ? []
            : command.operation === "remove"
              ? old.filter((_, i) => i !== command.index)
              : old.map((f, i) =>
                  i === command.index
                    ? { ...f, role: command.role || f.role }
                    : f,
                ),
        );
      }
      if (command.type === "auth") {
        if (command.mode === "logout") {
          const saved = await saveTask().then(() => true, () => false);
          const response = await fetch("/api/auth/logout", {
            method: "POST", headers: {"x-keyantong-actor": user?.id || "guest"},
          });
          if (!response.ok) throw new Error("当前会话已变化，请刷新页面后重试。");
          clearPrivateState();
          setUser(null);
          owner.current = "guest";
          announce(saved ? "已退出。下次登录后可以从任务历史继续。" : "已退出。最后一次任务更新未能保存。");
          signalAccountChange();
        } else if (user) {
          announce("你已登录。切换账号前请先退出。");
        } else setAuthFlow({ mode: command.mode, step: "email" });
      }
      if (command.type === "external") {
        window.open(command.url, "_blank", "noopener,noreferrer");
      }
      if (command.type === "worker_chat") {
        setContext({ activeAgent: command.id });
        if (command.message) {
          const r = await scopedFetch(
            `/api/workers/${encodeURIComponent(command.id)}/chat`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: command.message }),
            },
          );
          announce(r.reply || r.text || "暂时没有收到角色回复。");
        }
      }
      if (command.type === "ncbi_validate") {
        const f = filesRef.current.find((f) => f.role === "ncbi-manifest");
        if (!f)
          throw new Error(
            "请拖入包含 bioproject、biosample、library、files 和本机路径说明的 JSON 元数据清单；不要拖入测序文件或密钥。",
          );
        const raw = await f.file.text();
        if (/-----BEGIN.*PRIVATE KEY|"key_content"\s*:/i.test(raw)) throw new Error("元数据含有密钥内容，请移除后重试；文件未上传。");
        const data = JSON.parse(raw);
        const response = await fetch("/api/tools/ncbi-validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(data),
        });
        const d = await response.json();
        if (!response.ok && !Array.isArray(d.issues)) throw new Error(d.error || "元数据校验暂未完成");
        announce(
          d.ok
            ? "元数据校验通过。接下来使用本机助手直传 NCBI；网站不会替你保管密钥或自动完成最终提交。"
            : (d.issues || [])
                .map((i: any) => `${i.field}：${i.message}`)
                .join("\n"),
          d.ok ? {url:"/downloads/keyantong-ncbi-assistant-preview.zip",label:"下载本机助手开发预览"} : undefined,
        );
      }
    }
  }
  async function openGroupPicker() {
    const matrices = filesRef.current.filter(file => file.role === "matrix");
    if (matrices.length !== 1) {
      announce(matrices.length
        ? "当前有多份表达矩阵。请先移除这次不用的文件，我再读取样本列。"
        : "请先选入表达矩阵或粘贴它的路径，我会从表头读取样本并显示分组下拉框。");
      return;
    }
    const actor = owner.current;
    const matrix = matrices[0];
    const prefix = (await matrix.file.slice(0, 128 * 1024).text()).replace(/^\uFEFF/, "");
    if (owner.current !== actor || !filesRef.current.some(file => file.id === matrix.id)) return;
    if (!/[\r\n]/.test(prefix) && matrix.file.size > 128 * 1024)
      throw new Error("表达矩阵表头过长，无法安全识别样本。");
    const samples = (csvRows(prefix)[0] || []).slice(1).map(name => name.trim());
    if (samples.length < 2 || samples.some(name => !name) || new Set(samples).size !== samples.length)
      throw new Error("表头需要至少两个样本，且样本名不能重复或为空。");
    if (samples.length > 500)
      throw new Error("样本超过 500 个，请使用分组配置文件。");
    setGroupPicker({ matrixId: matrix.id, samples });
    announce(`从 ${matrix.file.name} 读到了 ${samples.length} 个样本。请在下面为每个样本选择分组。`);
  }

  function saveGroups(picker: GroupPicker, values: Record<string, GroupRole>) {
    if (picker !== groupPicker || !filesRef.current.some(file => file.id === picker.matrixId && file.role === "matrix")) {
      setGroupPicker(null);
      announce("表达矩阵已变化，请重新打开分组选择。");
      return;
    }
    const control = picker.samples.filter(sample => values[sample] === "control");
    const treatment = picker.samples.filter(sample => values[sample] === "treatment");
    if (control.length < 2 || treatment.length < 2 || control.length + treatment.length !== picker.samples.length)
      return;
    const design = {
      version: 1,
      groups: [
        {id:"control", name:"control", role:"control", samples:control},
        {id:"treatment", name:"treatment", role:"treatment", samples:treatment},
      ],
      options: {contrasts:[{id:"treatment_vs_control", treatment:"treatment", control:"control"}]},
    };
    const file = new File([JSON.stringify(design)], "rna_groups.json", {type:"application/json"});
    const remaining = filesRef.current.filter(entry => entry.role !== "groups");
    if (remaining.length >= 8) {
      announce("待处理文件已满，请先移除不用的文件再保存分组。");
      return;
    }
    const next: Attachment[] = [...remaining, { id:uid(), file, role:"groups" }];
    filesRef.current = next;
    setFiles(next);
    setContext({ workspace:"analysis", method:"rnaseq" });
    setGroupPicker(null);
    announce(`已保存分组：对照组 ${control.length} 个，实验组 ${treatment.length} 个。核对无误后，可以说“开始分析”。`);
  }

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || locked.current || restoring) return;
    const actor = owner.current;
    const epoch = taskEpoch.current;
    setInput("");
    locked.current = true;
    setBusy(true);
    try {
      if (authFlow) {
        if (/^(取消|退出输入|cancel)$/i.test(text)) {
          setAuthFlow(null);
          announce("已结束隐私输入。我们继续。");
        } else
          try {
            await authenticate(text);
          } catch (e: any) {
            if (e.code === "DEVICE_LIMIT") {
              setAuthFlow({ ...authFlow, step: "replace" });
              announce(
                "该账号已在两台设备登录。若要在这里继续，请说“替换最旧设备”；我会重新请你输入密码来确认身份。",
              );
            } else throw e;
          }
        return;
      }
      if (/-----BEGIN.*PRIVATE KEY|(?:api[_ -]?key|密码|password)\s*[:：=]\s*\S+/i.test(text)) {
        announce(
          "这条内容未保存、未发送给模型。请先说“我要登录”，然后在隐私输入区输入密码。",
        );
        return;
      }
      const paths = localPaths(text);
      const folder = paths.length ? undefined : folderPath(text, waitingForFolder.current || !!uploadDraft.current);
      const isUploadTurn = !!folder || (!paths.length && (
        /免安装上传|科研通暂存|准备暂存|确认暂存|继续暂存|查看暂存进度|批量上传|上传.*(?:转录组|原始数据|FASTQ|NCBI|SRA)|(?:原始数据|NCBI|SRA).*上传|查看上传状态|上传进度/i.test(text) ||
        ((uploadDraft.current || waitingForFolder.current) && !/^(回到?首页|返回首页|我要登录|我要注册|查看我的账号|退出登录)/.test(text))
      ));
      const display = folder ? "已提供本机测序文件夹路径" : paths.length ? redactLocalPaths(text) : text;
      setMessages((m) => [...m.slice(-79), { id: uid(), role: "user", text: display }]);
      if (!paths.length && !folder && /下拉|选择器|点选|选择分组/.test(text) && /分组|对照组|实验组|样本/.test(text)) {
        await openGroupPicker();
        return;
      }
      const namedFile = paths.length || folder ? undefined : fileNameReference(text);
      const reference = contextRef.current.fileReference;
      const declaration = /(?:表达矩阵|分组表|分组文件)/.exec(text)?.[0];
      const declaredRole = declaration === "表达矩阵" ? "matrix" : declaration ? "groups" : undefined;
      const referenceName = namedFile || (/^(?:这个(?:个)?|这份|该).*(?:是|作为)/.test(text) && declaredRole ? reference?.name : undefined);
      if (referenceName) {
        const rememberedRole = reference?.name.toLowerCase() === referenceName.toLowerCase() ? reference.role : undefined;
        setContext({ fileReference: { name: referenceName, role: declaredRole || rememberedRole } });
      }
      if (!paths.length && !folder && /(?:NCBI|SRA).*(?:网页|浏览器|官网)|(?:网页|浏览器|官网).*(?:NCBI|SRA)/i.test(text)) {
        announce((uploadDraft.current ? "本批文件清单仍保留在当前任务。你可以说“导出上传清单”。\n" : "") + ncbiWebUpload);
        return;
      }
      if (isUploadTurn && !referenceName) {
        try {
          await handleUpload(text, folder);
        } catch (error) {
          const detail = error instanceof Error ? error.message : "本机操作未完成。";
          announce(detail + (detail.includes("助手") ? "\n" + ncbiWebUpload : ""), detail.includes("助手") || /preload|ascp|密钥/.test(detail) ? {
            url: assistantDownload, label: "下载或更新科研通本机助手",
          } : undefined);
        }
        return;
      }
      if (paths.length) {
        const capacity = 8 - filesRef.current.length;
        if (paths.length > capacity) {
          announce("待处理列表最多保留 8 个文件，请先移除不用的文件再重试。");
          return;
        }
        const name = paths[0].split(/[\\/]/).at(-1)!;
        if (contextRef.current.fileReference?.name !== name) setContext({ fileReference: { name } });
        const local: File[] = [];
        for (const path of paths) {
          try {
            local.push(await readLocalFile(path));
          } catch (error) {
            if (owner.current !== actor || taskEpoch.current !== epoch) return;
            const detail = error instanceof Error ? error.message : "本机文件读取失败。";
            announce(detail, detail.includes("助手") ? {
              url: assistantDownload,
              label: "下载科研通本机助手",
            } : undefined);
            break;
          }
        }
        if (local.length && owner.current === actor && taskEpoch.current === epoch) await addFiles(local);
        return;
      }
      if (
        pending.current &&
        text.replace(/[。！!\s]/g, "") === pending.current.phrase
      ) {
        const d: AgentReply = await scopedFetch("/api/agent/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ticket: pending.current.ticket,
            confirmation: pending.current.phrase,
          }),
        });
        if (owner.current !== actor) return;
        pending.current = null;
        setContext({ draft: undefined });
        announce(d.reply);
        await execute(d.commands);
        setRevision((v) => v + 1);
        return;
      }
      // Open an already displayed official result inside the user's actual keyboard/click gesture.
      const ordinal = text.match(
        /^(?:请)?打开(?:第)?([一二三四五六七八九十\d]+)(?:个|条|篇)?(?:官网|网站|结果|资源)?[。！!]?$/,
      );
      const digit = ordinal
        ? Number(ordinal[1]) ||
          (
            {
              一: 1,
              二: 2,
              三: 3,
              四: 4,
              五: 5,
              六: 6,
              七: 7,
              八: 8,
              九: 9,
              十: 10,
            } as Record<string, number>
          )[ordinal[1]]
        : 0;
      const item = digit ? contextRef.current.items?.[digit - 1] : undefined;
      const named = /^(?:请)?(?:打开|前往)/.test(text)
        ? resourceIndex.current.find((r) => text.includes(r.name))
        : undefined;
      const official =
        item &&
        ["genomes", "tools", "papers"].includes(
          contextRef.current.workspace || "",
        )
          ? item.url
          : named?.url;
      if (official && /^https:\/\//.test(official)) {
        window.open(official, "_blank", "noopener,noreferrer");
        announce("已请求在新窗口打开对应的官方来源。");
        return;
      }
      const d: AgentReply = await scopedFetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, context: { ...contextRef.current, unavailableFiles: unavailableFiles.current }, fileTurn: !!referenceName, history: messages.slice(-12).map(m => ({role: m.role, content: redactLocalPaths(m.text).slice(0,1000)})) }),
      });
      if (owner.current !== actor) return;
      announce(d.reply);
      if (d.draft !== undefined) {
        pending.current = null;
        setContext({ draft: d.draft || undefined });
      }
      if (d.ticket && d.confirmation)
        pending.current = { ticket: d.ticket, phrase: d.confirmation };
      if (d.draft === null) pending.current = null;
      await execute(d.commands);
    } catch (e) {
      if (owner.current !== actor) return;
      announce(
        e instanceof Error ? e.message : "暂时没能完成，我们可以稍后再试。",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <State.Provider
      value={{
        messages,
        tasks,
        activeTask,
        taskNotice,
        switchTask,
        groupPicker,
        saveGroups,
        closeGroupPicker: () => setGroupPicker(null),
        busy: busy || restoring,
        input,
        setInput,
        send,
        context: contextState,
        setContext,
        files,
        addFiles,
        user,
        authFlow,
        revision,
        announce,
        report,
      }}
    >
      {children}
    </State.Provider>
  );
}
export function useConversation() {
  const value = useContext(State);
  if (!value) throw new Error("Conversation provider missing");
  return value;
}
