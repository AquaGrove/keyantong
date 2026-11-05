import { NextResponse } from "next/server";
import { currentUser } from "@/lib/user-session";
import { isEntitled } from "@/lib/user-store";
import { analysisJobs } from "@/lib/analysis/jobs";
import { getRnaseqJob, listRnaseqJobs, rnaseqDownloadAvailable } from "@/lib/tools/rnaseq-jobs";
import { describeJob } from "@/lib/agent/receipts";
import { rateLimit } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({error:"请先在对话中登录，再查看自己的任务。"}, {status:401});
  if (!rateLimit("agent-jobs:" + user.id, {windowMs:60000,max:35}).ok)
    return NextResponse.json({error:"查询较频繁，请稍后再试。"}, {status:429});
  const ids = [...new Set(new URL(request.url).searchParams.getAll("id"))];
  if (ids.length > 8 || ids.some(id => !/^[a-z0-9_-]{1,80}$/i.test(id)))
    return NextResponse.json({error:"无效任务编号。"}, {status:400});
  try {
    const omics = ids.length
      ? (await Promise.all(ids.filter(id => /^[0-9a-f-]{36}$/i.test(id)).map(id => analysisJobs(user.id,id)))).flat()
      : await analysisJobs(user.id);
    const rna = isEntitled(user)
      ? (ids.length ? ids.map(id => getRnaseqJob(id,user.id)).filter(x => x !== null) : listRnaseqJobs(user.id,8))
      : [];
    return NextResponse.json({jobs:[
      ...omics.map(j => describeJob(j)),
      ...rna.map(j => describeJob(j, rnaseqDownloadAvailable(j))),
    ].sort((a,b) => b.created.localeCompare(a.created)).slice(0,8)});
  } catch {
    return NextResponse.json({error:"暂时无法读取任务，请稍后说“查看分析进度”。"},{status:503});
  }
}
