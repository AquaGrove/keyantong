"use client";
import { safeDownload } from "@/lib/agent/receipts";
import { useEffect, useRef } from "react";
import { useConversation } from "./provider";
import { TaskHistory } from "./task-history";
import { SampleGroupPicker } from "./group-picker";
import { MessageText } from "./message-text";
import { droppedFiles } from "./sequencing";
export function ConversationConsole({ home = false }: { home?: boolean }) {
  const { messages, busy, input, setInput, send, files, addFiles, authFlow, announce, user, groupPicker } =
      useConversation(),
    thread = useRef<HTMLDivElement>(null),
    picker = useRef<HTMLInputElement>(null);
  const secret = authFlow?.step === "password" || authFlow?.step === "code";
  useEffect(() => {
    if (messages.length > 1 && thread.current)
      thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages, busy, groupPicker]);
  return (
    <section
      className={`conversation-console ${home ? "at-home" : ""}`}
      aria-label="与科研通对话"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        void droppedFiles(e.dataTransfer).then(files => {
          if (!files.length) { announce("没有读取到文件，可以粘贴完整路径或点击「选文件」。"); return; }
          return addFiles(files);
        }).catch(error => announce(error instanceof Error ? error.message : "无法读取拖入的文件。"));
      }}
    >
      <div className="conversation-presence">
        <span className="conversation-light" />
        <span>{busy ? "正在为你处理…" : "我在，随时开始。"}</span>
        {!authFlow && <div className="conversation-account-actions">
          {user ? (
            <>
              <button type="button" disabled={busy} onClick={() => void send("查看我的账号")}>我的账号</button>
              <button type="button" disabled={busy} onClick={() => void send("退出登录")}>退出</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void send("我要登录")}>登录</button>
              <button type="button" disabled={busy} onClick={() => void send("我要注册")}>注册</button>
            </>
          )}
        </div>}
      </div>
      <div
        ref={thread}
        className="conversation-thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.map((m) => (
          <div className={`conversation-message is-${m.role}`} key={m.id}>
            <span className="conversation-speaker">
              {m.role === "user" ? "你" : "研"}
            </span>
            <div>
              <MessageText text={m.text} />
              {m.role === "assistant" && m.download && safeDownload(m.download.url) ? (
                <p>
                  <a className="conversation-message-link" href={m.download.url} download>
                    {m.download.label} ↓
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? (
          <div className="conversation-thinking" aria-label="正在处理">
            <i />
            <i />
            <i />
          </div>
        ) : null}
      </div>
      {files.length ? (
        <div className="conversation-files" aria-label="待处理文件">
          {files.map((f, i) => (
            <span key={f.id}>
              {i + 1}. {f.file.name}
            </span>
          ))}
          {!groupPicker && files.some(file => file.role === "matrix") && (
            <button
              type="button"
              className="conversation-file-picker"
              disabled={busy || !!authFlow}
              onClick={() => void send("选择分组")}
            >选择分组</button>
          )}
        </div>
      ) : null}
      <form
        className="conversation-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {secret ? (
          <input
            type="password"
            autoComplete="off"
            aria-label={
              authFlow?.step === "code" ? "隐私验证码输入" : "隐私密码输入"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={
              authFlow?.step === "code"
                ? "输入验证码，不进入聊天记录"
                : "输入密码，不进入聊天记录"
            }
            autoFocus
          />
        ) : (
          <textarea
            aria-label="说出你的想法"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              authFlow ? "输入校园邮箱…" : "说出你的想法，余下的交给我们…"
            }
            rows={home ? 3 : 2}
            disabled={busy}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
        )}
        {!secret && (
          <>
            <input
              ref={picker}
              type="file"
              accept=".csv,.tsv,.json,.fastq,.fq,.gz"
              multiple
              hidden
              onChange={(event) => {
                void addFiles(Array.from(event.currentTarget.files || []));
                event.currentTarget.value = "";
              }}
            />
            <button
              type="button"
              className="conversation-file-picker"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              选文件
            </button>
          </>
        )}
        <button
          type="submit"
          className="conversation-send"
          disabled={busy || !input.trim()}
          aria-label="发送"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 19V5m-6 6 6-6 6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
      <div className="conversation-footnote">
        {secret
          ? "隐私输入不会发送给模型；说“取消”可以结束。"
          : "可粘贴本机路径、选文件或拖入文件夹 · Enter 发送"}
      </div>
      {groupPicker && <SampleGroupPicker key={groupPicker.matrixId} picker={groupPicker} />}
    </section>
  );
}
export function ConversationHome() {
  return (
    <main className="conversation-home">
      <header className="conversation-masthead">
        <div className="conversation-brand">
          科研通<span>一切可求，皆可响应</span>
        </div>
        <h1>你的想法，值得被回应。</h1>
      </header>
      <div className="conversation-workspace">
        <TaskHistory />
        <ConversationConsole home />
      </div>
    </main>
  );
}
