import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  // Осторожно: не возвращаем чувствительные данные, только ключи и безопасные поля
  const user = session?.user ? {
    keys: Object.keys(session.user),
    id: (session.user as any).id ?? null,
    _id: (session.user as any)._id ?? null,
    sub: (session.user as any).sub ?? null,
    email: (session.user as any).email ?? null
  } : null;

  return NextResponse.json({ hasSession: !!session, user });
}
