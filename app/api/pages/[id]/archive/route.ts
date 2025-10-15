/**
 * POST /api/pages/:id/archive
 * body: { archived: boolean, cascade?: boolean }
 * При archived: true — убираем child_page у внешнего родителя;
 * При archived: false — возвращаем child_page у внешнего родителя;
 * ВСЕГДА: не трогаем deletedAt.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

async function collectDescendants(rootId: string, userId: string): Promise<string[]> {
  const q: string[] = [rootId];
  const out = new Set<string>();
  while (q.length) {
    const cur = q.shift()!;
    const kids = await Page.find({ parentId: cur, userId }).select("_id").lean();
    for (const k of kids) {
      const id = String((k as any)._id);
      if (!out.has(id)) {
        out.add(id);
        q.push(id);
      }
    }
  }
  return Array.from(out);
}

async function removeChildLinkFromParent(parentId: string, childId: string, userId: string) {
  const parent = await Page.findOne({ _id: parentId, userId });
  if (!parent) return;
  const content = normalizeEditorContent(parent.content);
  const before = (content.blocks as any[]).length;
  content.blocks = (content.blocks as any[]).filter(
    (b: any) => !(b?.type === "child_page" && String(b?.data?.refId) === String(childId))
  );
  if ((content.blocks as any[]).length !== before) {
    parent.content = content;
    await parent.save();
  }
}

async function ensureChildLink(parentId: string, childId: string, userId: string) {
  const parent = await Page.findOne({ _id: parentId, userId });
  if (!parent) return;
  const content = normalizeEditorContent(parent.content);
  const exists = (content.blocks as any[]).some(
    (b: any) => b?.type === "child_page" && String(b?.data?.refId) === String(childId)
  );
  if (!exists) {
    (content.blocks as any[]).push({ type: "child_page", data: { refId: String(childId) } });
    parent.content = content;
    await parent.save();
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  // 1) выставляем флаг архивности ветке/узлу
  await Page.updateMany({ _id: { $in: ids }, userId, deletedAt: null }, { $set: { archived } });

  // 2) обновляем ссылку у внешнего родителя "корня"
  if (page.parentId) {
    const pid = String(page.parentId);
    if (archived) {
      await removeChildLinkFromParent(pid, id, userId);
    } else {
      await ensureChildLink(pid, id, userId);
    }
  }

  return NextResponse.json({ success: true, archived, affected: ids.length });
}
