"use client";

import { useConversation } from "./provider";

export function TaskHistory() {
  const { user, tasks, activeTask, taskNotice, switchTask, busy, authFlow } = useConversation();
  if (!user) return null;
  const titles = new Map<string, number>();
  for (const task of tasks) titles.set(task.title, (titles.get(task.title) || 0) + 1);
  const timestamp = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return (
    <aside className="conversation-history" aria-label="任务历史">
      <header>
        <h2>任务历史</h2>
        <button type="button" disabled={busy || !!authFlow} onClick={() => void switchTask()}>新任务</button>
      </header>
      <div className="conversation-history-list">
        {tasks.length ? tasks.map(task => (
          <button type="button" key={task.id} disabled={busy || !!authFlow}
            aria-current={activeTask === task.id ? "true" : undefined}
            onClick={() => void switchTask(task.id)}>
            <span>{task.title}</span>
            <time dateTime={task.updated_at}>{timestamp.format(new Date(task.updated_at))}{(titles.get(task.title) || 0) > 1 ? " · " + task.id.slice(0, 6) : ""}</time>
          </button>
        )) : <p>开始对话后，任务会自动出现在这里。</p>}
      </div>
      <small role="status">{taskNotice}</small>
    </aside>
  );
}
