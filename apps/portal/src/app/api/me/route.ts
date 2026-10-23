import { NextResponse } from "next/server";
import { publicUser } from "@/lib/user-store";
import { currentUser } from "@/lib/user-session";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({ user: publicUser(user) });
}
