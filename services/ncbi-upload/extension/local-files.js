const channel = "keyantong-local-files-v1";
window.addEventListener("message", (event) => {
  const message = event.data;
  if (
    event.source !== window || event.origin !== location.origin ||
    message?.channel !== channel || typeof message.id !== "string" ||
    !["read", "scan", "prepare", "start", "status"].includes(message.type)
  ) return;

  if (["read", "scan"].includes(message.type) &&
      (typeof message.path !== "string" || message.path.length > 4096 ||
        /[\x00-\x1f\x7f]/.test(message.path) ||
        (message.type === "read" && !/\.(csv|tsv|json)$/i.test(message.path)))) return;

  const send = (result) =>
    window.postMessage({ channel, type: "result", id: message.id, result }, location.origin);
  send({ kind: "connected" });
  const labels = {
    read: "读取本机文件并加入待处理列表",
    scan: "检查文件夹中的测序文件名和大小",
    prepare: "核对本机 FASTQ 文件并生成 NCBI 传输预检",
    start: "开始向 NCBI 传输刚才核对的 FASTQ 批次",
    status: "读取本机传输状态",
  };
  if (message.type !== "status" && (!document.hasFocus() || !window.confirm(
    "科研通请求：" + labels[message.type] + (message.path ? "\n\n" + message.path : "")
  ))) {
    send({ ok: false, error: "已取消本机操作。" });
    return;
  }
  const bridge = chrome.runtime.connect({ name: channel });
  let finished = false;
  bridge.onMessage.addListener((result) => {
    send(result);
    if (result.kind === "done" || typeof result.ok === "boolean") {
      finished = true;
      bridge.disconnect();
    }
  });
  bridge.onDisconnect.addListener(() => {
    if (!finished) send({ ok: false, error: "请重新加载或更新科研通本机助手。" });
  });
  const actions = { read: "stream_analysis_file", scan: "scan_folder" };
  bridge.postMessage({
    ...message.request,
    action: actions[message.type] || message.type,
    path: message.path,
  });
});
