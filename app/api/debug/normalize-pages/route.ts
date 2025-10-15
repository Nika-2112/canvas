import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

export async function POST() {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  // Всем страницам текущего пользователя, где archived НЕ задан, проставим false
  const res = await Page.updateMany(
    { userId, archived: { $exists: false } },
    { $set: { archived: false } }
  );

  // В новых Mongoose доступны matchedCount / modifiedCount
  const matched = (res as any).matchedCount ?? 0;
  const modified = (res as any).modifiedCount ?? 0;

  return NextResponse.json({ ok: true, matched, modified });
}
