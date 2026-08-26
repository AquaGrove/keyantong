import { AdminShell } from "@/components/admin-shell";
import { getGithubRepoFull, getSiteUrl } from "@keyantong/ops-shared";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const hasPassword = Boolean(process.env.ADMIN_PASSWORD);
  const hasSessionSecret = Boolean(process.env.ADMIN_SESSION_SECRET);
  const hasGithubToken = Boolean(process.env.GITHUB_TOKEN);

  return (
    <AdminShell>
      <h1>设置</h1>
      <p className="lead">
        环境与密钥只做状态展示，不回显明文。修改请编辑本机 `.env` 后重启管理端。
      </p>

      <section className="panel">
        <h2>环境状态</h2>
        <table className="table">
          <thead>
            <tr>
              <th>项</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>客户端 URL</td>
              <td className="mono">{getSiteUrl()}</td>
            </tr>
            <tr>
              <td>GitHub 仓库</td>
              <td className="mono">{getGithubRepoFull()}</td>
            </tr>
            <tr>
              <td>ADMIN_PASSWORD</td>
              <td>{hasPassword ? "已配置" : "缺失（无法登录）"}</td>
            </tr>
            <tr>
              <td>ADMIN_SESSION_SECRET</td>
              <td>{hasSessionSecret ? "已配置" : "回退使用口令派生（建议单独配置）"}</td>
            </tr>
            <tr>
              <td>GITHUB_TOKEN</td>
              <td>{hasGithubToken ? "已配置" : "未配置（公开 API 限额较低）"}</td>
            </tr>
            <tr>
              <td>监听</td>
              <td className="mono">127.0.0.1:3001（默认）</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="panel" style={{ marginTop: "0.85rem" }}>
        <h2>安全提示</h2>
        <p className="lead" style={{ marginBottom: 0 }}>
          管理端仅供站长本机使用。不要把 3001 映射到公网；若必须上云，请另配强口令、HTTPS 与 IP
          限制。重置口令：改 `.env` 中 `ADMIN_PASSWORD` 并重启，旧 Cookie 会在签名密钥变更后失效。
        </p>
      </section>
    </AdminShell>
  );
}
