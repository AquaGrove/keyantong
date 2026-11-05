import { Suspense } from "react";
import { ConversationHome } from "@/components/conversation/console";
import { ConversationReader } from "@/components/conversation/surface";

export const dynamic = "force-dynamic";

export default function Home() {
  return <>
    <ConversationHome />
    <Suspense fallback={null}><ConversationReader /></Suspense>
  </>;
}
