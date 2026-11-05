const HOST = "org.keyantong.ncbi";
chrome.action.onClicked.addListener(() =>
  chrome.tabs.create({ url: chrome.runtime.getURL("assistant.html") }),
);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only the extension's own UI can issue local operations. Content scripts cannot.
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL("assistant.html")
  )
    return false;
  if (message.type === "native") {
    const allowed = [
      "doctor",
      "capture_preload",
      "download_installer",
      "launch_installer",
      "prepare",
      "start",
      "status",
    ];
    if (!allowed.includes(message.payload?.action)) {
      sendResponse({ ok: false, error: "操作无效" });
      return false;
    }
    const port = chrome.runtime.connectNative(HOST);
    let done = false;
    port.onMessage.addListener((response) => {
      done = true;
      sendResponse(response);
      port.disconnect();
    });
    port.onDisconnect.addListener(() => {
      if (!done)
        sendResponse({
          ok: false,
          error:
            chrome.runtime.lastError?.message ||
            "本机助手未连接，请先安装 native host。",
        });
    });
    port.postMessage(message.payload);
    return true;
  }
  if (message.type === "download_key") {
    chrome.downloads.download(
      {
        url: "https://submit.ncbi.nlm.nih.gov/preload/aspera_key/",
        filename: "keyantong-ncbi/aspera.openssh",
        conflictAction: "uniquify",
        saveAs: false,
      },
      (id) => {
        if (chrome.runtime.lastError || id === undefined) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message || "私钥下载失败",
          });
          return;
        }
        let resolved = false;
        const finish = async () => {
          if (resolved) return;
          const [item] = await chrome.downloads.search({ id });
          if (item?.state === "complete") {
            resolved = true;
            chrome.downloads.onChanged.removeListener(listener);
            sendResponse({ ok: true, data: { path: item.filename } });
          } else if (item?.state === "interrupted") {
            resolved = true;
            chrome.downloads.onChanged.removeListener(listener);
            sendResponse({
              ok: false,
              error: "私钥下载中断，请重新登录 NCBI 后重试",
            });
          }
        };
        const listener = (delta) => {
          if (delta.id === id) void finish();
        };
        chrome.downloads.onChanged.addListener(listener);
        void finish();
      },
    );
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener((bridge) => {
  if (
    bridge.name !== "keyantong-local-files-v1" ||
    bridge.sender?.origin !== "https://keyantong.online" ||
    bridge.sender.frameId !== 0
  ) {
    bridge.disconnect();
    return;
  }
  let native;
  let finished = false;
  bridge.onDisconnect.addListener(() => native?.disconnect());
  bridge.onMessage.addListener((request) => {
    if (native || !["stream_analysis_file", "scan_folder", "prepare", "start", "status"].includes(request?.action)) return;
    if (["stream_analysis_file", "scan_folder"].includes(request.action) &&
        (typeof request.path !== "string" || request.path.length > 4096)) return;
    native = chrome.runtime.connectNative(HOST);
    native.onMessage.addListener((result) => {
      finished = result.kind === "done" || typeof result.ok === "boolean";
      bridge.postMessage(result);
    });
    native.onDisconnect.addListener(() => {
      if (!finished) bridge.postMessage({
        ok: false,
        error: "本机连接已断开，请安装或更新科研通本机助手后重试。",
      });
    });
    native.postMessage(request);
  });
});
