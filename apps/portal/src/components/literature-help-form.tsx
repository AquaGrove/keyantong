"use client";

import { FormEvent, useMemo, useState } from "react";

type Props = {
  issuesNewBase: string;
  initialDoi?: string;
};

export function LiteratureHelpForm({ issuesNewBase, initialDoi = "" }: Props) {
  const [doi, setDoi] = useState(initialDoi);
  const [title, setTitle] = useState("");
  const [tried, setTried] = useState("");
  const [need, setNeed] = useState("合法全文获取路径（OA / 馆藏 / 作者稿）");

  const payload = useMemo(() => {
    const issueTitle = title.trim()
      ? `文献求助：${title.trim().slice(0, 80)}`
      : doi.trim()
        ? `文献求助：${doi.trim()}`
        : "文献求助：请填写题名或 DOI";

    const body = [
      "## 文献求助（合规）",
      "",
      "> 本帖只寻求**合法获取路径**（OA、预印本、机构库、馆藏/代理、向作者索取等）。",
      "> **禁止**上传、索要或转发受版权保护的付费 PDF。",
      "",
      `**题名 / 主题：** ${title.trim() || "（未填）"}`,
      `**DOI / PMID：** ${doi.trim() || "（未填）"}`,
      `**已尝试：** ${tried.trim() || "（未填）"}`,
      `**希望得到的帮助：** ${need.trim()}`,
      "",
      "### 响应者请优先提供",
      "- Unpaywall / OpenAlex / 出版社 OA 版本链接",
      "- 预印本（arXiv、bioRxiv 等）或机构知识库链接",
      "- 学校图书馆检索步骤、数据库名、是否需校园网/VPN",
      "- 作者主页 / ResearchGate「Request full-text」等**合法**途径说明",
      "",
      "请勿附带盗版站点链接或 PDF 附件。",
    ].join("\n");

    const url = new URL(issuesNewBase);
    url.searchParams.set("title", issueTitle);
    url.searchParams.set("body", body);
    url.searchParams.set("labels", "literature-help");
    return url.toString();
  }, [doi, title, tried, need, issuesNewBase]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    window.open(payload, "_blank", "noopener,noreferrer");
  }

  return (
    <form className="help-form" onSubmit={onSubmit}>
      <label>
        文献题名或主题
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例如：某综述的题目关键词"
          required
        />
      </label>
      <label>
        DOI 或 PMID（尽量填写）
        <input
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          placeholder="10.xxxx/... 或 PMID"
        />
      </label>
      <label>
        你已经试过什么
        <textarea
          value={tried}
          onChange={(e) => setTried(e.target.value)}
          placeholder="例如：学校库没有、Unpaywall 无 OA、出版社只要订阅…"
          rows={3}
        />
      </label>
      <label>
        希望得到的帮助类型
        <select value={need} onChange={(e) => setNeed(e.target.value)}>
          <option>合法全文获取路径（OA / 馆藏 / 作者稿）</option>
          <option>检索策略（关键词、数据库、筛选）</option>
          <option>如何向作者合法索取全文</option>
          <option>馆际互借 / 文献传递流程咨询</option>
        </select>
      </label>
      <p className="form-note">
        提交后会打开 GitHub Issue 预填模板。发帖即公开求助；他人用评论回复合法链接与步骤——
        <strong>不会、也不应出现 PDF 附件互传</strong>。
      </p>
      <p className="enter-hint mono">按 Enter 提交求助</p>
      <button className="enter-submit-hidden" type="submit">
        生成求助帖并打开
      </button>
    </form>
  );
}
