import type { Metadata } from "next";
import Link from "next/link";
import { LiteratureHelpForm } from "@/components/literature-help-form";
import {
  GITHUB_DISCUSSIONS_URL,
  GITHUB_ISSUES_URL,
  GITHUB_URL,
} from "@/lib/site";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export const metadata: Metadata = {
  title: "社区",
  description: "科研通合规互助社区：工具分享与求助、文献合法获取路径、环境排错与经验分享。",
};

export const dynamic = "force-dynamic";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ doi?: string }>;
}) {
  const { doi } = await searchParams;
  const issuesNew = `${GITHUB_URL}/issues/new`;
  const user = await currentUser();
  const entitled = isEntitled(user ?? undefined);

  return (
    <main className="page">
      <div className="module-hero">
        <p className="page-kicker">Community</p>
        <h1 className="page-title">社区互助</h1>
        <p className="page-lead">
          科研通社区两块核心场景：
          <strong>工具分享 / 求助</strong>（外链 + 描述，可搜索）与
          <strong>文献合法获取路径</strong>（禁止 PDF 互传与盗版链接）。
          目标是互动交流、学习成长的大平台。
        </p>
      </div>

      <div className="hub-grid" style={{ marginBottom: "1.25rem" }}>
        <Link className="hub-tile" href="/community/tools">
          <span className="tag">Tools</span>
          <h3>工具分享</h3>
          <p>分享好用工具的下载链接与功能描述，大家搜索即可找到。</p>
        </Link>
        <Link className="hub-tile" href="/community/tools?tab=help">
          <span className="tag">Help</span>
          <h3>工具求助</h3>
          <p>搜不到就发求助；有人能解决就去发分享帖并关联关闭。</p>
        </Link>
        <a className="hub-tile" href="#ask">
          <span className="tag">Literature</span>
          <h3>文献互助</h3>
          <p>只讨论 OA / 馆藏 / 作者稿等合法路径，不传付费 PDF。</p>
        </a>
      </div>

      <div className="flow" aria-label="文献互助流程">
        <div className="flow-step">
          <span className="flow-num">1</span>
          <div>
            <strong>发求助</strong>
            <p>写清 DOI/题名与已尝试途径</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">2</span>
          <div>
            <strong>获响应</strong>
            <p>他人回复合法链接或检索步骤</p>
          </div>
        </div>
        <div className="flow-step">
          <span className="flow-num">3</span>
          <div>
            <strong>自己获取</strong>
            <p>按指引下载 OA / 走馆藏或作者渠道</p>
          </div>
        </div>
      </div>

      <div className="rules-banner" role="note">
        <strong>合规红线：</strong>
        可以分享 Unpaywall、预印本、机构库、图书馆数据库操作说明、向作者 Request
        的方法；不可以上传出版社付费 PDF、不可以贴盗版站点、不可以把社区当「传 PDF」渠道。
        工具区分享仅限合法授权软件外链，同样禁止盗版文献站。
      </div>

      <section className="section" id="ask">
        <h2>我要发文献求助</h2>
        {!entitled ? (
          <>
            <p className="section-lead">
              发帖需要校园邮箱登录，且处于试用期或永久会员。浏览开放求助仍可公开进行。
            </p>
            <div className="actions">
              <Link className="btn btn-primary" href="/login">
                登录后发帖
              </Link>
              <Link className="btn btn-secondary" href="/register">
                校园邮箱注册
              </Link>
              <Link className="btn btn-secondary" href="/pricing">
                会员说明
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="section-lead">
              填写下面表单，一键打开预填好的 GitHub Issue（标签{" "}
              <code className="mono">literature-help</code>）。论坛上线后同一结构会迁到论坛版块。
            </p>
            <LiteratureHelpForm issuesNewBase={issuesNew} initialDoi={doi} />
          </>
        )}
      </section>

      <section className="section" id="answer" style={{ marginTop: "1.25rem" }}>
        <h2>我要响应别人的求助</h2>
        <p className="section-lead">看到求助帖时，优先按下面清单回复（复制即用）：</p>
        <ul className="check-list">
          <li>先查 <a href="https://unpaywall.org/">Unpaywall</a> / OpenAlex 是否有 OA</li>
          <li>查预印本：arXiv、bioRxiv、medRxiv、SSRN 等</li>
          <li>说明本校图书馆：数据库名、检索字段、是否需要 VPN</li>
          <li>若仅作者稿可得：给作者主页或「Request full-text」步骤，勿代传 PDF</li>
          <li>把可点击的<strong>合法 URL</strong>和复现步骤写清楚</li>
        </ul>
        <div className="actions" style={{ marginTop: "1rem" }}>
          <a className="btn btn-primary" href={`${GITHUB_ISSUES_URL}?q=is%3Aissue+is%3Aopen+label%3Aliterature-help`}>
            查看开放的文献求助
          </a>
          <a className="btn btn-secondary" href={GITHUB_DISCUSSIONS_URL}>
            去 Discussions 交流
          </a>
          <Link className="btn btn-secondary" href="/community/tools?tab=help">
            查看工具求助
          </Link>
        </div>
      </section>

      <section className="section" style={{ marginTop: "1.25rem" }}>
        <h2>其他互助</h2>
        <div className="hub-grid">
          <a className="hub-tile" href={GITHUB_ISSUES_URL}>
            <span className="tag">Issues</span>
            <h3>环境与工具求助</h3>
            <p>安装失败、依赖冲突、工作流报错：开 Issue 并附最小复现。</p>
          </a>
          <a className="hub-tile" href={GITHUB_DISCUSSIONS_URL}>
            <span className="tag">Discussions</span>
            <h3>经验与方法</h3>
            <p>组会笔记、检索策略、合规获取经验，适合开放讨论。</p>
          </a>
        </div>
      </section>
    </main>
  );
}
