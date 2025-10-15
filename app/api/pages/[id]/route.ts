/**
 * API /api/pages/:id
 *
 * Упрощение: удаление ВСЕГДА каскадное (страница + все подстраницы).
 * Дополнительно:
 *  - Перед отдачей родителя (GET) синхронизируем его child_page-блоки с реальными детьми,
 *    чтобы у родителя всегда отображались все подстраницы.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

/** Тайпгард: params может быть объектом или Promise (разные версии Next) */
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
    return { time: Date.now(), version: "2.31.0", blocks: [] };
  }
  return raw;
}

/** Единая проверка владельца и загрузка страницы */
async function loadOwnedPage(pageId: string) {
  await connectDB();
  const session = await getSession();
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) {
    return { error: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  }
  const page = await Page.findById(pageId);
  if (!page) return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };
  if (String(page.userId) !== String(sessionUserId)) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }
  return { page, sessionUserId };
}

/** Удалить ссылку child_page на childId из контента parent (если есть) */
async function removeChildLinkFromParent(parentId: string, childId: string, ownerId: string) {
  const parent = await Page.findOne({ _id: parentId, userId: ownerId });
  if (!parent) return;
  const content = normalizeEditorContent(parent.content);
  const before = content.blocks.length;
  content.blocks = content.blocks.filter(
    (b: any) => !(b?.type === "child_page" && String(b?.data?.refId) === String(childId))
  );
  if (content.blocks.length !== before) {
    parent.content = content;
    await parent.save();
  }
}

/** Синхронизация child_page-блоков у родителя с реальными детьми */
async function syncChildLinks(parentId: string, ownerId: string) {
  const parent = await Page.findOne({ _id: parentId, userId: ownerId });
  if (!parent) return;

  const content = normalizeEditorContent(parent.content);
  const children = await Page.find({ parentId: parentId, userId: ownerId }).select("_id").lean();
  const childIds = new Set(children.map((c) => String(c._id)));

  const blocks = content.blocks as any[];

  // убрать «битые» ссылки
  const filtered = blocks.filter((b) => {
    if (b?.type !== "child_page") return true;
    const ref = String(b?.data?.refId || "");
    return childIds.has(ref);
  });

  // уже имеющиеся ссылки
  const existingRefs = new Set(
    filtered.filter((b) => b?.type === "child_page").map((b) => String(b.data.refId))
  );

  // добавить недостающие ссылки (в конец)
  for (const c of children) {
    const id = String(c._id);
    if (!existingRefs.has(id)) filtered.push({ type: "child_page", data: { refId: id } });
  }

  const changed =
    filtered.length !== blocks.length || filtered.some((b, i) => b !== blocks[i]);

  if (changed) {
    parent.content = { ...content, blocks: filtered };
    await parent.save();
  }
}

/** Собрать всех потомков (вглубь) текущей страницы */
async function collectDescendants(rootId: string, ownerId: string): Promise<string[]> {
  const queue = [rootId];
  const all: Set<string> = new Set();

  while (queue.length) {
    const current = queue.shift()!;
    const kids = await Page.find({ parentId: current, userId: ownerId })
      .select("_id")
      .lean();
    for (const k of kids) {
      const id = String(k._id);
      if (!all.has(id)) {
        all.add(id);
        queue.push(id);
      }
    }
  }
  // не включаем rootId — он удалится отдельно
  return Array.from(all);
}

// -------------------- GET --------------------
export async function GET(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwnedPage(id);
  if ("error" in loaded) return loaded.error;

  // лечим «на родителе видна только одна подстраница»
  await syncChildLinks(id, loaded.sessionUserId);

  const fresh = await Page.findById(id);
  return NextResponse.json(fresh);
}

// -------------------- PUT --------------------
export async function PUT(
  req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwnedPage(id);
  if ("error" in loaded) return loaded.error;

  try {
    const body = await req.json();
    if (typeof body?.title === "string") loaded.page.title = body.title.trim();
    if (typeof body?.content !== "undefined") loaded.page.content = body.content;
    await loaded.page.save();
    return NextResponse.json(loaded.page);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при обновлении страницы" },
      { status: 500 }
    );
  }
}

// -------------------- DELETE (ВСЕГДА КАСКАД) --------------------
export async function DELETE(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwnedPage(id);
  if ("error" in loaded) return loaded.error;

  // запомним родителя, чтобы убрать ссылку
  const parentId = loaded.page.parentId ? String(loaded.page.parentId) : null;

  // соберём всех потомков (дети, внуки, …)
  const descendants = await collectDescendants(id, loaded.sessionUserId);
  const idsToDelete = [id, ...descendants];

  await Page.deleteMany({ _id: { $in: idsToDelete }, userId: loaded.sessionUserId });

  // у родителя (если есть) убираем ссылку на удалённого ребёнка и синхронизируем
  if (parentId) {
    await removeChildLinkFromParent(parentId, id, loaded.sessionUserId);
    await syncChildLinks(parentId, loaded.sessionUserId);
  }

  return NextResponse.json({ success: true, deleted: idsToDelete.length });
}
