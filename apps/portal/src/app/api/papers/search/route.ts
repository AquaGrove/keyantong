import { NextResponse } from "next/server";
import { searchWorks } from "@/lib/openalex";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }
  const { results, error } = await searchWorks(q);
  return NextResponse.json({ results, error: error || undefined });
}
