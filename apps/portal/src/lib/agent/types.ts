export type Workspace =
  | "home"
  | "genomes"
  | "tools"
  | "papers"
  | "forum"
  | "post"
  | "analysis"
  | "account"
  | "notifications"
  | "workers"
  | "ncbi"
  | "pricing"
  | "submissions";
export type AttachmentMeta = {
  id: string;
  name: string;
  size: number;
  role: string;
  evidence?: { sampleColumns: number; unit?: "tpm" | "fpkm"; fractional: boolean };
};
export type Draft = {
  kind: "resource" | "post" | "reply" | "worker";
  fields: Record<string, string>;
  targetId?: string;
  sourceId?: string;
  version?: number;
};
export type AgentContext = {
  workspace?: Workspace;
  query?: string;
  method?: "rnaseq" | "gwas" | "bsaseq" | "single-cell";
  config?: Record<string, unknown>;
  attachments?: AttachmentMeta[];
  unavailableFiles?: AttachmentMeta[];
  fileReference?: { name: string; role?: "matrix" | "groups" };
  draft?: Draft;
  items?: { id: string; name: string; url?: string }[];
  activeAgent?: string;
  postId?: string;
  page?: number;
  blockedReason?: string;
  graphSeed?: string;
  graphMode?: "network" | "timeline" | "list";
};
export type AgentCommand =
  | {
      type: "navigate";
      workspace: Workspace;
      query?: string;
      id?: string;
      method?: string;
    }
  | { type: "configure"; method: string; config: Record<string, unknown> }
  | { type: "run"; method: string }
  | { type: "jobs_status" }
  | { type: "auth"; mode: "login" | "register" | "verify" | "logout" }
  | {
      type: "files";
      operation: "clear" | "remove" | "assign";
      index?: number;
      role?: string;
    }
  | { type: "external"; url: string }
  | { type: "refresh" }
  | { type: "collapse" }
  | { type: "worker_chat"; id: string; message: string }
  | { type: "ncbi_validate" }
  | { type: "block_analysis"; reason?: string }
  | { type: "page"; delta: number }
  | { type: "graph"; seed?: string; mode?: "network" | "timeline" | "list" };
export type AgentReply = {
  reply: string;
  commands?: AgentCommand[];
  draft?: Draft | null;
  ticket?: string;
  confirmation?: string;
  source?: string;
};

export const fileMarkers = ["gene", "gene_id", "transcript", "transcript_id", "sample", "group", "trait", "id", "chrom", "pos", "ref", "alt", "ref_high", "alt_high", "ref_low", "alt_low", "groups", "bioproject", "biosample"];
