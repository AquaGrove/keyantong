let snapshot = null,
  payload = null,
  task = null,
  busy = false;
const $ = (id) => document.getElementById(id);
const show = (id, value) => {
  $(id).textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
};
async function native(action, fields = {}) {
  const r = await chrome.runtime.sendMessage({
    type: "native",
    payload: { action, ...fields },
  });
  if (!r?.ok) throw new Error(r?.error || "本机助手未连接");
  return r.data;
}
async function portal(action, fields = {}) {
  const id = Number($("tab").value);
  if (!id) throw new Error("请选择已登录的 NCBI SRA 标签页");
  const r = await chrome.tabs.sendMessage(id, { action, ...fields });
  if (!r?.ok) throw new Error(r?.error || "请刷新 NCBI 页面后重试");
  return r.data;
}
async function act(fn) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((b) => (b.disabled = true));
  show("notice", "正在处理，请稍候…");
  try {
    await fn();
    show("notice", "操作已完成，请查看对应步骤的结果。");
  } catch (e) {
    show("notice", e.message || "操作失败");
  } finally {
    busy = false;
    document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    $("start").disabled = !task || !$("transfer-consent").checked;
  }
}
async function tabs() {
  const tabs = await chrome.tabs.query({
    url: "https://submit.ncbi.nlm.nih.gov/subs/sra/*",
  });
  $("tab").replaceChildren(
    ...tabs.map((t) => {
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.title;
      return o;
    }),
  );
}
$("doctor").onclick = () =>
  act(async () => show("environment", await native("doctor")));
$("inspect").onclick = () =>
  act(async () => {
    await tabs();
    snapshot = await portal("inspect");
    show("environment", snapshot);
  });
$("tab").onchange = () => {
  snapshot = null;
};
$("key").onclick = () =>
  act(async () => {
    snapshot = await portal("inspect");
    task = null;
    $("transfer-consent").checked = false;
    if (!snapshot.loggedIn || !snapshot.command)
      throw new Error("请登录 NCBI，展开 Aspera 命令行说明后重试。");
    const result = await chrome.runtime.sendMessage({ type: "download_key" });
    if (!result?.ok) throw new Error(result?.error || "下载失败");
    show(
      "environment",
      await native("capture_preload", {
        command: snapshot.command,
        keyPath: result.data.path,
      }),
    );
  });
$("download-installer").onclick = () =>
  act(async () => show("environment", await native("download_installer")));
$("install").onclick = () =>
  act(async () => show("environment", await native("launch_installer")));
$("metadata").onchange = async () => {
  task = null;
  $("start").disabled = true;
  const file = $("metadata").files[0];
  try {
    if (!file || file.size > 256000)
      throw new Error("请选择 256KB 以内的元数据 JSON");
    payload = JSON.parse(await file.text());
    show("notice", "已读取元数据，尚未启动传输。");
  } catch (e) {
    payload = null;
    show("notice", e.message);
  }
};
$("folder").oninput = () => {
  task = null;
  $("start").disabled = true;
};
$("prepare").onclick = () =>
  act(async () => {
    if (!payload) throw new Error("请先选择元数据 JSON");
    task = await native("prepare", { payload, localFolder: $("folder").value });
    const { approval, ...review } = task;
    show("plan", review);
    $("transfer-consent").checked = false;
    await chrome.storage.local.set({ taskId: task.id });
  });
$("transfer-consent").onchange = () => {
  $("start").disabled = !task || !$("transfer-consent").checked;
};
$("start").onclick = () =>
  act(async () => {
    if (!task || !$("transfer-consent").checked)
      throw new Error("请先核对并同意传输计划");
    show(
      "transfer",
      await native("start", { taskId: task.id, approval: task.approval }),
    );
  });
$("status").onclick = () =>
  act(async () => {
    const stored = await chrome.storage.local.get("taskId");
    const id = task?.id || stored.taskId;
    if (!id) throw new Error("还没有本机任务");
    show("transfer", await native("status", { taskId: id }));
  });
$("fill").onclick = () =>
  act(async () => {
    if (!payload?.portal_fields)
      throw new Error(
        "元数据未提供 portal_fields，请先读取当前步骤的字段并配置映射。",
      );
    show(
      "environment",
      await portal("fill", { fields: payload.portal_fields }),
    );
  });
void tabs();
