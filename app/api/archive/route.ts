import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

export async function GET() {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  // отдаём ВСЕ заархивированные страницы (не удалённые), включая детей
  const items = await Page.find({ userId, archived: true, deletedAt: null })
    .select("_id title parentId updatedAt")
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json(
    items.map((p: any) => ({
      _id: String(p._id),
      title: p.title || "Без названия",
      parentId: p.parentId ? String(p.parentId) : null,
      updatedAt: p.updatedAt,
    }))
  );
}
