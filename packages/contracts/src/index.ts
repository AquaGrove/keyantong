/** Shared health payload used by service stubs. */
export type HealthResponse = {
  status: "ok" | "degraded" | "error";
  service: string;
};

export type ServiceName = "bridge" | "rag" | "toolhub" | "analysis";
