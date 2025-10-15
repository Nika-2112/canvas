/**
 * POST /api/pages/:id/restore
 * Восстанавливает страницу и ВСЕ её потомки из корзины (deletedAt -> null).
 * После восстановления у родителя синхронизируем child_page блоки.
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

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] };
  }
  return raw;
}

async function ensureChildLink(parentId: string, childId: string, userId: string) {
  const parent = await Page.findOne({ _id: parentId, userId });
  if (!parent) return;
  const content = normalizeEditorContent(parent.content);
  const exists = content.blocks.some((b: any) => b?.type === "child_page" && String(b?.data?.refId) === String(childId));
  if (!exists) {
    content.blocks.push({ type: "child_page", data: { refId: String(childId) } });
    parent.content = content;
    await parent.save();
  }
}

export async function POST(
  _req: Request,
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

  const ids = [id, ...(await collectDescendants(id, userId))];

  await Page.updateMany({ _id: { $in: ids }, userId }, { $set: { deletedAt: null } });

  // вернём ссылку у родителя
  if (page.parentId) {
    await ensureChildLink(String(page.parentId), id, userId);
  }

  return NextResponse.json({ success: true, restored: ids.length });
}
