export type Download = { url: string; label: string };
export type JobReceipt = {id:string; status:string; created:string; text:string; download?:Download};
const status: Record<string,string> = {queued:"已入队", running:"正在计算", pending_upstream:"等待上游", succeeded:"已完成", failed:"失败", cancelled:"已取消"};
export function terminal(status: string) {
  return ["succeeded", "failed", "cancelled"].includes(status);
}
export function safeDownload(url: string) {
  return /^\/api\/(?:analysis\/jobs|tools\/rnaseq)\/[a-z0-9_-]{1,80}\/download$/i.test(url) ||
    url === "/downloads/keyantong-ncbi-assistant-preview.zip";
}
// Only persisted worker fields are summarized; no model interprets statistical significance here.
export function describeJob(j: any, rnaDownload = false): JobReceipt {
  const rna = j.kind === "rnaseq";
  const method = j.parameters?.method;
  const name = rna ? "RNAseq" : method === "bsa.delta.v1" ? "BSA" : "GWAS";
  const summary = rna ? j.summary : j.parameters?.summary;
  const metrics: [string,string][] = rna
    ? [["n_samples","样本"],["n_genes","基因"],["n_up","上调"],["n_down","下调"]]
    : [["retainedSamples","通过质控的样本"],["testedVariants","检验位点"],["retainedVariants","保留位点"],["windows","窗口"]];
  const lines = [`${name} 任务 ${String(j.id).slice(0,8)}：${status[j.status] || "状态暂不可用"}。`];
  if (j.status === "succeeded") {
    const values = metrics.filter(([key]) => Number.isFinite(summary?.[key])).map(([key,label]) => label + " " + summary[key]);
    if (values.length) lines.push(values.join("，") + "。");
    if (rna && typeof summary?.de_engine === "string") lines.push("统计引擎：" + summary.de_engine.slice(0,80) + "。");
    if (!rna && typeof summary?.warnings?.[0] === "string") lines.push(summary.warnings[0].slice(0,300));
  }
  if (j.status === "failed") {
    const error = j.last_error || j.error;
    if (typeof error === "string") lines.push(error.slice(0,300));
    lines.push("修正输入后，可以告诉我重新分析。");
  }
  const url = `/api/${rna ? "tools/rnaseq" : "analysis/jobs"}/${j.id}/download`;
  return {id:j.id,status:j.status,created:String(j.created_at || j.createdAt || ""),text:lines.join("\n"),
    ...(j.status === "succeeded" && (rna ? rnaDownload : j.result_object_id) && safeDownload(url)
      ? {download:{url,label:"下载结果与运行记录"}} : {})};
}

export function describeRead(mode: string, data: any, page: number): string | undefined {
  const list = (rows: any[], heading: string, line: (r:any) => string, empty: string, paged = false) => {
    const visible = rows.slice(paged ? page * 10 : 0, paged ? page * 10 + 5 : 5);
    return visible.length ? heading + "\n" + visible.map((r,i) => `${i+1}. ${line(r)}`).join("\n")
      : rows.length ? "已经没有更多结果。可以说“上一页”或换个关键词。" : empty;
  };
  const clip = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0,max) : "";
  switch(mode) {
    case "genomes":
    case "tools": return list(data.resources || [],`查到 ${data.resources?.length || 0} 条资源。以下是本页前几条：`,
      r => [r.content.name,r.content.assembly,clip(r.content.summary)].filter(Boolean).join(" · "), "没有找到匹配的资源。可以换物种名、拉丁名或工具用途。",true);
    case "papers": return list(data.results || [],data.graph ? `引用网络已读取：${data.graph.nodes.length} 篇文献、${data.graph.edges.length} 条关系。以下是本页前几篇：` : `查到 ${data.results?.length || 0} 篇文献。以下是本页前几篇：`,
      r => [clip(r.title),r.year || r.publication_year,clip(r.doi,100)].filter(Boolean).join(" · "), "没有读到匹配文献。可以提供英文关键词、完整题名或 DOI。",true);
    case "forum": return list(data.posts || data.items || [],"读到了这些科研分享：",r => `${clip(r.title)}（${r.responseCount || 0} 条回应）`, "没有找到相关分享。你可以换个关键词，或描述问题让我帮你整理求助。");
    case "post": return data.post ? `${clip(data.post.title)}\n${clip(data.post.body,700)}\n共 ${data.post.responseCount || 0} 条回应。\n${(data.post.responses || []).slice(0, 5).map((r:any,i:number) => `${i+1}. ${clip(r.body,400)}`).join("\n")}\n你可以说“回复：……”继续。` : undefined;
    case "account": return data.user ? [
      `当前账号：${data.user.username || data.user.email}。计算权益${data.user.entitled ? "有效" : "未开通"}。`,
      ...((data.user.devices || []).map((device:any, i:number) => `${i+1}. ${clip(device.label)}`)),
    ].join("\n") : undefined;
    case "notifications": return list(data.items || [],"最近通知：",r => clip(r.title) + "：" + clip(r.body || r.message),"暂时没有通知。");
    case "submissions": return list(data.resources || [],"你的投稿进度：",r => `${r.content.name} · ${({pending:"待审核", published:"已收录", rejected:"需修订", withdrawn:"已下架"} as Record<string,string>)[r.status] || r.status}${r.review_note ? "：" + clip(r.review_note) : ""}`,"你还没有投稿记录。");
    case "workers": return list(data.agents || [],"你的专属角色：",r => clip(r.name) + " · " + clip(r.persona),"你还没有专属角色。告诉我它的名字和你希望它如何协助你。");
  }
}
