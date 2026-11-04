import { promises as fs } from "fs";
import path from "path";

export type NotifKind = "results" | "system" | "hot";

export type NotificationItem = {
  id: string;
  kind: NotifKind;
  title: string;
  titleEn?: string;
  body: string;
  bodyEn?: string;
  href?: string;
  createdAt: string;
  read?: boolean;
  /** null = broadcast to all signed-in users */
  userId?: string | null;
};

type StoreFile = { items: NotificationItem[] };

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), ".data");
}

function filePath() {
  return path.join(dataDir(), "notifications.json");
}

async function ensure(): Promise<StoreFile> {
  const fp = filePath();
  try {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (Array.isArray(parsed.items)) return parsed;
  } catch {
    /* seed */
  }
  const now = Date.now();
  const seed: StoreFile = {
    items: [
      {
        id: `n-hot-${now}`,
        kind: "hot",
        title: "聊天首页上线：用一句话进入各模块",
        titleEn: "Chat-first home: enter modules in one sentence",
        body: "首页已改为对话调度；文献网 / 社区 / 工具从首页隐藏，由助手引导进入。",
        bodyEn: "Home is now a dispatcher chat. Literature / community / tools are hidden from the home chrome and opened via the assistant.",
        href: "/",
        createdAt: new Date(now).toISOString(),
        userId: null,
      },
      {
        id: `n-sys-${now}`,
        kind: "system",
        title: "NCBI 上传坚持本机直传",
        titleEn: "NCBI upload stays local-direct",
        body: "大文件请在你电脑执行 ascp；门户只生成校验与脚本，不中转测序数据。",
        bodyEn: "Run ascp on your computer. The portal only validates metadata and builds scripts — no sequencing relay.",
        href: "/tools/ncbi-upload",
        createdAt: new Date(now - 3600_000).toISOString(),
        userId: null,
      },
      {
        id: `n-res-${now}`,
        kind: "results",
        title: "示例：转录组任务完成后会出现在此",
        titleEn: "Example: RNA-seq results land here",
        body: "真实分析完成后，worker 会写入结果通知（含任务 ID 与下载入口）。",
        bodyEn: "When a real job finishes, the worker posts a result notice (job id + download link).",
        href: "/tools/rnaseq",
        createdAt: new Date(now - 7200_000).toISOString(),
        userId: null,
      },
    ],
  };
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(seed, null, 2), "utf8");
  return seed;
}

export async function listNotifications(userId?: string | null): Promise<NotificationItem[]> {
  const store = await ensure();
  return store.items
    .filter((n) => !n.userId || (userId && n.userId === userId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function markRead(id: string, userId?: string | null): Promise<boolean> {
  const store = await ensure();
  const item = store.items.find((n) => n.id === id);
  if (!item) return false;
  if (item.userId && userId && item.userId !== userId) return false;
  item.read = true;
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2), "utf8");
  return true;
}

export async function pushNotification(
  item: Omit<NotificationItem, "id" | "createdAt"> & { id?: string; createdAt?: string },
): Promise<NotificationItem> {
  const store = await ensure();
  const row: NotificationItem = {
    id: item.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: item.createdAt || new Date().toISOString(),
    kind: item.kind,
    title: item.title,
    titleEn: item.titleEn,
    body: item.body,
    bodyEn: item.bodyEn,
    href: item.href,
    read: false,
    userId: item.userId ?? null,
  };
  store.items.unshift(row);
  store.items = store.items.slice(0, 200);
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2), "utf8");
  return row;
}
