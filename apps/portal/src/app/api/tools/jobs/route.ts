import { NextResponse } from "next/server";
import { isEntitled } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";
import { listNcbiJobs } from "@/lib/tools/ncbi-jobs";
import { listRnaseqJobs, quotaForUser, rnaseqDownloadAvailable } from "@/lib/tools/rnaseq-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  if (!isEntitled(user)) {
    return NextResponse.json({ error: "需要有效校园试用或永久会员" }, { status: 403 });
  }
  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "all").toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 20) || 20));

  const rnaseq =
    kind === "all" || kind === "rnaseq"
      ? listRnaseqJobs(user.id, limit).map((j) => ({
          ...j,
          download_available: rnaseqDownloadAvailable(j),
          download_url: rnaseqDownloadAvailable(j) ? `/api/tools/rnaseq/${j.id}/download` : null,
        }))
      : [];
  const ncbi =
    kind === "all" || kind === "ncbi"
      ? listNcbiJobs(user.id, limit).map((j) => ({
          ...j,
          download_available: false,
          download_url: null as string | null,
        }))
      : [];

  const jobs = [...rnaseq, ...ncbi].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
  );

  return NextResponse.json({
    jobs: jobs.slice(0, limit),
    quota: quotaForUser(user.id),
  });
}
