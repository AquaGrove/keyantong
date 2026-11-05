import { NextResponse } from "next/server";
import {
  METHODS,
  ENVIRONMENT,
  RESEARCH_ADAPTERS,
} from "@/lib/analysis/methods";
export async function GET() {
  return NextResponse.json({
    methods: METHODS,
    environment: ENVIRONMENT,
    researchAdapters: RESEARCH_ADAPTERS,
    enabled: process.env.OMICS_ENABLED === "1",
  });
}
