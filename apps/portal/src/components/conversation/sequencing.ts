export type SequenceFile = { name: string; size: number };
export type SequenceInventory = { files: SequenceFile[]; ignored: number };
export type UploadTask = { id: string; state: string; approval: string; destination: string; totalBytes: number; message?: string };
export type UploadDraft = {
  inventory: SequenceInventory;
  folder?: string;
  fields: Record<string, string>;
  task?: UploadTask;
};
export const fastq = /\.(?:fastq|fq)(?:\.gz)?$/i;
export const uploadIntent = /(?:批量上传|原始数据.*上传|上传.*(?:转录组|原始数据|测序)|NCBI|\bSRA\b)/i;

export function folderPath(text: string, expecting: boolean) {
  const absolute = /^(?:\/(?!\/)|~\/|[a-z]:[\\/]|\\\\)/i;
  const quoted = text.match(/["“`]([^"”`\r\n]+)["”`]/)?.[1];
  const labeled = text.match(/(?:文件夹|目录|folder)(?:路径)?\s*[:：=是]?\s*((?:\/|~\/|[a-z]:[\\/]|\\\\)[^\r\n，。；！？]+)/i)?.[1];
  const inline = uploadIntent.test(text)
    ? text.match(/(?:\/Users\/|\/home\/|~\/|[a-z]:[\\/])[^\r\n，。；！？"”]+/i)?.[0]
    : undefined;
  const candidate = (quoted || labeled || inline || text).trim().replace(/[。；;]+$/, "");
  if ((!expecting && !uploadIntent.test(text) && !labeled && !absolute.test(text)) ||
      !absolute.test(candidate) || /\.(csv|tsv|json)$/i.test(candidate)) return undefined;
  return candidate;
}

export function pairFiles(files: SequenceFile[]) {
  const pairs = new Map<string, { read1: string[]; read2: string[] }>();
  const unknown: string[] = [];
  for (const {name} of files) {
    const match = name.replace(fastq, "").match(/^(.+)[_.-]R?([12])(_\d{3})?$/i);
    if (!match) { unknown.push(name); continue; }
    const key = match[1] + (match[3] || "");
    const pair = pairs.get(key) || {read1: [], read2: []};
    (match[2] === "1" ? pair.read1 : pair.read2).push(name);
    pairs.set(key, pair);
  }
  const incomplete = [...pairs].filter(([, pair]) => pair.read1.length !== 1 || pair.read2.length !== 1);
  return {pairs, unknown, incomplete, complete: pairs.size - incomplete.length};
}

export function inventoryFromFiles(files: File[]): SequenceInventory {
  return {
    files: files.filter(file => fastq.test(file.name)).map(file => ({name:file.name, size:file.size})),
    ignored: files.filter(file => !fastq.test(file.name)).length,
  };
}

export async function droppedFiles(transfer: DataTransfer): Promise<File[]> {
  const plain = Array.from(transfer.files);
  const entries = Array.from(transfer.items).map(item => item.webkitGetAsEntry?.());
  const directories = entries.filter((entry): entry is FileSystemDirectoryEntry => Boolean(entry?.isDirectory));
  if (!directories.length) return plain;
  if (directories.length !== 1 || entries.some(entry => entry?.isFile))
    throw new Error("请一次拖入一个测序文件夹，方便核对同一批次。");
  const reader = directories[0].createReader();
  const files: File[] = [];
  let ignored = false;
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const entry of batch) {
      if (!entry.isFile) { ignored = true; continue; }
      files.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
      if (files.length > 3000) throw new Error("文件夹超过 3000 个文件，请按批次拆分。");
    }
  }
  if (ignored) throw new Error("文件夹含有子目录，请拖入实际存放 FASTQ 的那一层。");
  return files;
}

const required = [
  ["title", "项目标题"], ["description", "项目简介"], ["organism", "物种学名"],
  ["isolate", "材料品系"], ["date", "采集日期"], ["layout", "测序布局"],
  ["selection", "文库选择"], ["platform", "测序平台"], ["model", "仪器型号"],
] as const;
export function missingUploadField(fields: Record<string,string>) {
  return required.find(([key]) => !fields[key]);
}
export function mergeUploadFields(fields: Record<string,string>, text: string) {
  const next = {...fields};
  const lines = text.split(/[\r\n；;]/);
  let found = false;
  for (const line of lines) {
    const match = line.match(/^\s*([^:：]+)[:：]\s*(.+)$/);
    const field = match && required.find(([, label]) => label === match[1].trim());
    if (field && match) { next[field[0]] = match[2].trim(); found = true; }
  }
  const field = missingUploadField(fields);
  if (!found && field) next[field[0]] = text.trim();
  const layout = next.layout;
  if (layout && /^(双端|paired|pe)$/i.test(layout)) next.layout = "paired";
  else if (layout && /^(单端|single|se)$/i.test(layout)) next.layout = "single";
  else if (layout) throw new Error("测序布局请回答“单端”或“双端”。");
  return next;
}

export function uploadPayload(draft: UploadDraft) {
  const { fields, inventory } = draft;
  if (inventory.ignored) throw new Error("文件夹还有非 FASTQ 文件或子目录。请提供只含本批 FASTQ 的专用文件夹，再重新核对。");
  if (inventory.files.some(file => file.size <= 0)) throw new Error("发现空 FASTQ，须修正后再准备上传。");
  const pairs = pairFiles(inventory.files);
  if (fields.layout === "paired" && (pairs.unknown.length || pairs.incomplete.length))
    throw new Error("双端配对存在缺失、重复或无法识别的文件名，请核对后重扫。");
  const runs = fields.layout === "paired"
    ? [...pairs.pairs].map(([sample, pair]) => ({sample, files: [...pair.read1, ...pair.read2]}))
    : inventory.files.map(({name}) => ({sample:name.replace(fastq, ""),files:[name]}));
  return {
    bioproject: {title:fields.title, description:fields.description, data_type:"Transcriptome"},
    biosample: {sample_name:runs[0].sample, organism:fields.organism, isolate_or_breed:fields.isolate, collection_date:fields.date},
    library: {library_strategy:"RNA-Seq", library_source:"TRANSCRIPTOMIC", library_selection:fields.selection,
      library_layout:fields.layout, platform:fields.platform, instrument_model:fields.model},
    files: inventory.files.map(({name}) => ({filename:name})),
    runs,
  };
}
