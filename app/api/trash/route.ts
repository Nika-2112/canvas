import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

const RETENTION_DAYS = 7;

export async function GET() {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  // авто-удаление «просроченных»
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await Page.deleteMany({ userId, deletedAt: { $ne: null, $lte: cutoff } });

  // отдать свежую корзину
  const items = await Page.find({ userId, deletedAt: { $ne: null, $gt: cutoff } })
    .sort({ deletedAt: -1 })
    .lean();

  // добавим поле daysLeft (сколько дней до авто-удаления)
  const withLeft = items.map((p: any) => {
    const msLeft = RETENTION_DAYS * 24 * 60 * 60 * 1000 - (Date.now() - new Date(p.deletedAt).getTime());
    return { ...p, daysLeft: Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))) };
  });

  return NextResponse.json({ retentionDays: RETENTION_DAYS, items: withLeft });
}
