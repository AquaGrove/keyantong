import {notFound} from "next/navigation";import {ConversationSurface} from "@/components/conversation/surface";
export const dynamic="force-dynamic";export default async function Page({params}:{params:Promise<{kind:string}>}){const {kind}=await params;if(!["rnaseq","gwas","bsaseq","single-cell"].includes(kind))notFound();return <ConversationSurface mode="analysis" method={kind}/>;}
