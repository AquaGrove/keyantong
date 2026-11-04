import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

export type WorkerKind = "worker" | "pet";

export type WorkerAgent = {
  id: string;
  name: string;
  kind: WorkerKind;
  persona: string;
  skills: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryMessage = {
  role: "user" | "assistant";
  content: string;
  at: string;
};

export type WorkerMemory = {
  summary: string;
  messages: MemoryMessage[];
};

const MAX_WORKERS = 8;
const MAX_PETS = 3;
const MAX_MESSAGES = 40;

function dataRoot() {
  return process.env.DATA_DIR || path.join(process.cwd(), ".data");
}

function userDir(userId: string) {
  return path.join(dataRoot(), "workers", userId);
}

function agentsPath(userId: string) {
  return path.join(userDir(userId), "agents.json");
}

function memoryPath(userId: string, agentId: string) {
  return path.join(userDir(userId), agentId, "memory.json");
}

function newId() {
  return `w_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

async function readAgents(userId: string): Promise<WorkerAgent[]> {
  try {
    const raw = await fs.readFile(agentsPath(userId), "utf8");
    const parsed = JSON.parse(raw) as { agents?: WorkerAgent[] };
    return Array.isArray(parsed.agents) ? parsed.agents : [];
  } catch {
    return [];
  }
}

async function writeAgents(userId: string, agents: WorkerAgent[]) {
  const dir = userDir(userId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(agentsPath(userId), JSON.stringify({ agents }, null, 2), "utf8");
}

export async function listWorkers(userId: string): Promise<WorkerAgent[]> {
  return readAgents(userId);
}

export async function getWorker(userId: string, agentId: string): Promise<WorkerAgent | null> {
  const agents = await readAgents(userId);
  return agents.find((a) => a.id === agentId) || null;
}

export async function createWorker(
  userId: string,
  input: { name: string; kind: WorkerKind; persona: string; skills?: string[] },
): Promise<{ ok: true; agent: WorkerAgent } | { ok: false; error: string }> {
  const name = input.name.trim().slice(0, 40);
  const persona = input.persona.trim().slice(0, 800);
  if (!name) return { ok: false, error: "请填写名称" };
  if (!persona) return { ok: false, error: "请填写角色设定" };
  const kind = input.kind === "pet" ? "pet" : "worker";
  const skills = (input.skills || [])
    .map((s) => String(s).trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 12);

  const agents = await readAgents(userId);
  const workers = agents.filter((a) => a.kind === "worker").length;
  const pets = agents.filter((a) => a.kind === "pet").length;
  if (kind === "worker" && workers >= MAX_WORKERS) {
    return { ok: false, error: `打工人最多 ${MAX_WORKERS} 个` };
  }
  if (kind === "pet" && pets >= MAX_PETS) {
    return { ok: false, error: `宠物最多 ${MAX_PETS} 只` };
  }

  const now = new Date().toISOString();
  const agent: WorkerAgent = {
    id: newId(),
    name,
    kind,
    persona,
    skills,
    createdAt: now,
    updatedAt: now,
  };
  agents.unshift(agent);
  await writeAgents(userId, agents);
  await fs.mkdir(path.join(userDir(userId), agent.id), { recursive: true });
  await fs.writeFile(
    memoryPath(userId, agent.id),
    JSON.stringify({ summary: "", messages: [] } satisfies WorkerMemory, null, 2),
    "utf8",
  );
  return { ok: true, agent };
}

export async function deleteWorker(userId: string, agentId: string): Promise<boolean> {
  const agents = await readAgents(userId);
  const next = agents.filter((a) => a.id !== agentId);
  if (next.length === agents.length) return false;
  await writeAgents(userId, next);
  try {
    await fs.rm(path.join(userDir(userId), agentId), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return true;
}

export async function readMemory(userId: string, agentId: string): Promise<WorkerMemory> {
  try {
    const raw = await fs.readFile(memoryPath(userId, agentId), "utf8");
    const parsed = JSON.parse(raw) as WorkerMemory;
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      messages: Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_MESSAGES) : [],
    };
  } catch {
    return { summary: "", messages: [] };
  }
}

export async function appendMemory(
  userId: string,
  agentId: string,
  userText: string,
  assistantText: string,
): Promise<WorkerMemory> {
  const mem = await readMemory(userId, agentId);
  const now = new Date().toISOString();
  mem.messages.push({ role: "user", content: userText.slice(0, 4000), at: now });
  mem.messages.push({ role: "assistant", content: assistantText.slice(0, 6000), at: now });
  mem.messages = mem.messages.slice(-MAX_MESSAGES);
  // Lightweight rolling summary (no extra LLM call in MVP)
  const tail = mem.messages
    .slice(-6)
    .map((m) => `${m.role}: ${m.content.slice(0, 120)}`)
    .join(" | ");
  mem.summary = tail.slice(0, 1200);
  await fs.mkdir(path.join(userDir(userId), agentId), { recursive: true });
  await fs.writeFile(memoryPath(userId, agentId), JSON.stringify(mem, null, 2), "utf8");
  const agents = await readAgents(userId);
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx >= 0) {
    agents[idx] = { ...agents[idx], updatedAt: now };
    await writeAgents(userId, agents);
  }
  return mem;
}

export function buildWorkerSystemPrompt(agent: WorkerAgent, memory: WorkerMemory): string {
  const base = [
    "你是科研通平台上的用户专属角色，不是通用客服。",
    `角色名：${agent.name}`,
    `类型：${agent.kind === "pet" ? "宠物同伴（语气可更轻松，但仍需专业可用）" : "打工人助手"}`,
    `人设：${agent.persona}`,
    agent.skills.length ? `擅长：${agent.skills.join("、")}` : "擅长：综合科研协助",
    "遵守：不输出密钥；不协助盗版全文；NCBI 大数据应本机直传；测序大文件不经门户中转。",
    "优先结合记忆摘要与近期对话；不确定时说明。",
  ];
  if (memory.summary) base.push(`记忆摘要：${memory.summary}`);
  return base.join("\n");
}
