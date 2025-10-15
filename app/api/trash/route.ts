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

  // авто-очистка просроченных
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await Page.deleteMany({ userId, deletedAt: { $ne: null, $lte: cutoff } });

  // берём все ещё не просроченные удалённые
  const allDeleted = await Page.find({
    userId,
    deletedAt: { $ne: null, $gt: cutoff },
  })
    .select("_id title parentId deletedAt")
    .sort({ deletedAt: -1 })
    .lean();

  // множество удалённых id — чтобы вычислить «корни» (у кого родитель не удалён)
  const deletedSet = new Set(allDeleted.map((d: any) => String(d._id)));

  // корень удалённого дерева = элемент, чей parentId НЕ в deletedSet
  const roots = allDeleted.filter((d: any) => {
    const pid = d.parentId ? String(d.parentId) : null;
    return !pid || !deletedSet.has(pid);
  });

  const items = roots.map((d: any) => {
    const msLeft =
      RETENTION_DAYS * 24 * 60 * 60 * 1000 -
      (Date.now() - new Date(d.deletedAt).getTime());
    return {
      _id: String(d._id),
      title: d.title || "Без названия",
      parentId: d.parentId ? String(d.parentId) : null,
      deletedAt: d.deletedAt,
      daysLeft: Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
    };
  });

  return NextResponse.json({ retentionDays: RETENTION_DAYS, items });
}
