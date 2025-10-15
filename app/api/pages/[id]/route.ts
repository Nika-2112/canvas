/**
 * /api/pages/:id
 * - GET    : вернуть страницу + синхронизация child_page у родителя
 * - PUT    : обновить
 * - DELETE : мягкое удаление (в корзину) каскадом; ?force=1 — удалить навсегда каскадом
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

function isPromise<T = unknown>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as any).then === "function";
}
async function getIdParam(
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
): Promise<string> {
  const p = isPromise(context.params) ? await context.params : context.params;
  return String(p?.id || "");
}

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

async function loadOwned(pageId: string) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return { error: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  const page = await Page.findById(pageId);
  if (!page) return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };
  if (String(page.userId) !== String(userId)) return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  return { page, userId };
}

async function removeChildLinkFromParent(parentId: string, childId: string, ownerId: string) {
  const parent = await Page.findOne({ _id: parentId, userId: ownerId });
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

async function syncChildLinks(parentId: string, ownerId: string) {
  const parent = await Page.findOne({ _id: parentId, userId: ownerId });
  if (!parent) return;

  const content = normalizeEditorContent(parent.content);
    const children = await Page.find({
      parentId,
      userId: ownerId,
      archived: { $ne: true },   // 🔧 правка
      deletedAt: null,
    })
      .select("_id")
      .lean();



  const childSet = new Set(children.map((c) => String((c as any)._id)));

  const origBlocks: any[] = Array.isArray(content.blocks) ? (content.blocks as any[]) : [];
  const filtered: any[] = origBlocks.filter((b: any) => {
    if (b?.type !== "child_page") return true;
    return childSet.has(String(b?.data?.refId || ""));
  });

  const existing = new Set(
    filtered.filter((b: any) => b?.type === "child_page").map((b: any) => String(b.data.refId))
  );

  for (const c of children) {
    const id = String((c as any)._id);
    if (!existing.has(id)) filtered.push({ type: "child_page", data: { refId: id } });
  }

  // 👇 здесь были implicit any — типизируем параметры колбэка
  const changed =
    filtered.length !== origBlocks.length || filtered.some((b: any, i: number) => b !== origBlocks[i]);

  if (changed) {
    parent.content = { ...content, blocks: filtered };
    await parent.save();
  }
}

async function collectDescendants(rootId: string, ownerId: string): Promise<string[]> {
  const queue: string[] = [rootId];
  const out = new Set<string>();
  while (queue.length) {
    const cur = queue.shift() as string;
    const kids = await Page.find({ parentId: cur, userId: ownerId }).select("_id").lean();
    for (const k of kids) {
      const id = String((k as any)._id);
      if (!out.has(id)) {
        out.add(id);
        queue.push(id);
      }
    }
  }
  return Array.from(out);
}

// -------------------- GET --------------------
export async function GET(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  if (loaded.page.parentId) {
    await syncChildLinks(String(loaded.page.parentId), loaded.userId);
  }

  const fresh = await Page.findById(id);
  return NextResponse.json(fresh);
}

// -------------------- PUT --------------------
export async function PUT(
  req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  try {
    const body = await req.json();
    if (typeof body?.title === "string") loaded.page.title = body.title.trim();
    if (typeof body?.content !== "undefined") loaded.page.content = body.content;
    await loaded.page.save();
    return NextResponse.json(loaded.page);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Ошибка при обновлении страницы" }, { status: 500 });
  }
}

// -------------------- DELETE --------------------
// Мягкое удаление каскадом (корзина); ?force=1 — удалить навсегда каскадом
export async function DELETE(
  req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const parentId = loaded.page.parentId ? String(loaded.page.parentId) : null;
  const all = await collectDescendants(id, loaded.userId);
  const ids = [id, ...all];

  if (force) {
    await Page.deleteMany({ _id: { $in: ids }, userId: loaded.userId });
  } else {
    const now = new Date();
    await Page.updateMany(
      { _id: { $in: ids }, userId: loaded.userId },
      { $set: { deletedAt: now } }
    );
  }

  if (parentId) {
    await removeChildLinkFromParent(parentId, id, loaded.userId);
    await syncChildLinks(parentId, loaded.userId);
  }

  return NextResponse.json({ success: true, deleted: ids.length, permanent: force });
}
