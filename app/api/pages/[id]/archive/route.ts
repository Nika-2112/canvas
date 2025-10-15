/**
 * POST /api/pages/:id/archive
 * body: { archived: boolean, cascade?: boolean }
 * По умолчанию cascade=true — уводим/возвращаем ветку целиком.
 * Не трогаем deletedAt: архив — это не корзина.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

async function collectDescendants(rootId: string, userId: string): Promise<string[]> {
  const queue = [rootId];
  const out = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    const kids = await Page.find({ parentId: cur, userId }).select("_id").lean();
    for (const k of kids) {
      const id = String(k._id);
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    }
  }
  return Array.from(out);
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const id = String(params.id);
  const page = await Page.findById(id);
  if (!page) return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  if (String(page.userId) !== String(userId)) return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const archived = Boolean(body?.archived);
  const cascade = body?.cascade !== false; // по умолчанию true

  const ids = cascade ? [id, ...(await collectDescendants(id, userId))] : [id];

  await Page.updateMany(
    { _id: { $in: ids }, userId, deletedAt: null }, // архивировать/разарх. только живые страницы
    { $set: { archived } }
  );

  return NextResponse.json({ success: true, archived, affected: ids.length });
}
