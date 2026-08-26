import { AdminShell } from "@/components/admin-shell";
import {
  checkSelfHealth,
  checkUpstreamHealth,
  getSiteUrl,
} from "@keyantong/ops-shared";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const portalUrl = getSiteUrl();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE;
  const ragBase = process.env.NEXT_PUBLIC_RAG_BASE;
  const bbs = process.env.NEXT_PUBLIC_BBS_URL;

  const rows = [
    await checkSelfHealth("管理端 :3001"),
    await checkUpstreamHealth("客户端 Portal", portalUrl),
    await checkUpstreamHealth(
      "Bridge /health",
      apiBase ? `${apiBase.replace(/\/$/, "")}/health` : undefined,
    ),
    await checkUpstreamHealth(
      "RAG /health",
      ragBase ? `${ragBase.replace(/\/$/, "")}/health` : undefined,
    ),
    await checkUpstreamHealth(
      "论坛",
      bbs && !bbs.includes("localhost") ? bbs : undefined,
    ),
  ];

  const config = [
    { key: "PORTAL / SITE", value: portalUrl },
    { key: "NEXT_PUBLIC_API_BASE", value: apiBase || "（未配置）" },
    { key: "NEXT_PUBLIC_RAG_BASE", value: ragBase || "（未配置）" },
    { key: "NEXT_PUBLIC_BBS_URL", value: bbs || "（未配置，客户端走 /community）" },
  ];

  return (
    <AdminShell>
      <h1>服务健康</h1>
      <p className="lead">探测各上游是否可达。密钥不会显示在此页。</p>

      <section className="panel" style={{ marginBottom: "0.85rem" }}>
        <h2>探针结果</h2>
        <ul className="health">
          {rows.map((h) => (
            <li key={h.name}>
              <div>
                <strong>{h.name}</strong>
                <div className="mono">{h.detail}</div>
              </div>
              <span className={`badge ${h.ok ? "badge-ok" : "badge-bad"}`}>
                {h.ok ? "OK" : "DOWN"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>只读配置</h2>
        <table className="table">
          <thead>
            <tr>
              <th>键</th>
              <th>值</th>
            </tr>
          </thead>
          <tbody>
            {config.map((c) => (
              <tr key={c.key}>
                <td className="mono">{c.key}</td>
                <td>{c.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AdminShell>
  );
}
