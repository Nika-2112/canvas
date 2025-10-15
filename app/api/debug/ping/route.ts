import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

export async function GET() {
  try {
    await connectDB();
    const session = await getSession();
    const uid = getSessionUserId(session);
    return NextResponse.json({ ok: true, auth: !!uid, userId: uid || null });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "err" }, { status: 500 });
  }
}
