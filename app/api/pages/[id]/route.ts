// app/api/pages/[id]/route.ts
/**
 * /api/pages/:id
 * - GET    : вернуть страницу + синхронизация child_page у родителя
 * - PUT    : обновить title/content/properties
 * - DELETE : мягкое удаление (в корзину) каскадом; ?force=1 — удалить навсегда каскадом
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

/* ───────────────────────── helpers ───────────────────────── */

function isPromise<T = unknown>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as any).then === "function";
}

async function getIdParam(
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
): Promise<string> {
  const p = isPromise(context.params) ? await context.params : context.params;
  return String(p?.id || "");
}

/** Нормализация Editor.js-контента */
function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

/** Мягкая валидация свойств. Разрешаем типы: text | number | tags. */
/** Мягкая валидация свойств. Разрешаем: text | number | tags | status | date */
function validateProperties(input: any): { ok: boolean; value?: any[]; error?: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Ожидается массив свойств" };

  const normalized: any[] = [];
  for (const raw of input) {
    const id = String(raw?.id || "").trim();
    const name = String(raw?.name || "").trim() || "Без названия";
    const type = String(raw?.type || "text").trim();
    let value = raw?.value;

    if (!id) return { ok: false, error: "Свойство без id" };

    if (type === "text") {
      value = value == null ? "" : String(value);
    } else if (type === "number") {
      const num = Number(value);
      value = Number.isFinite(num) ? num : 0;
    } else if (type === "tags") {
      const arr = Array.isArray(value) ? value : [];
      value = arr.map((v) => String(v).trim()).filter(Boolean);
    } else if (type === "status") {
      const allowed = ["Не начато", "В работе", "Готово"];
      value = allowed.includes(value) ? value : "Не начато";
    } else if (type === "date") {
      // ожидаем { start: ISO | 'YYYY-MM-DD', end?: ISO | 'YYYY-MM-DD' | null }
      const v = (value && typeof value === "object") ? value : {};
      const startISO = v.start ? new Date(v.start) : new Date(); // если пусто — сегодня
      const start = isNaN(startISO.getTime())
        ? new Date() : startISO;
      let end: Date | null = v.end ? new Date(v.end) : null;
      if (end && isNaN(end.getTime())) end = null;

      // правило: end >= start (если прислали раньше — обнулим end)
      if (end && end < start) end = null;

      value = {
        start: start.toISOString().slice(0, 10),
        end: end ? end.toISOString().slice(0, 10) : null,
      };
    } else {
      // неизвестные типы приводим к text
      value = value == null ? "" : String(value);
      return normalized.push({ id, name, type: "text", value }), undefined as any;
    }

    normalized.push({ id, name, type, value });
  }

  return { ok: true, value: normalized };
}


/** Загрузка страницы с проверкой владельца */
async function loadOwned(pageId: string) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  const userRole = (session?.user as any)?.role || "guest";

  if (!userId) {
    return { error: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  }

  const page = await Page.findById(pageId);
  if (!page) {
    return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };
  }

  const isOwner = String(page.userId) === String(userId);
  const isMember = Array.isArray((page as any).members)
    ? (page as any).members.some((m: any) => String(m.userId) === String(userId))
    : false;

  // 🔧 Разрешаем доступ:
  if (isOwner || userRole === "admin" || isMember) {
    return { page, userId };
  }

  return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
}
/** Удалить из родителя «битую» ссылку на ребёнка */
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

/** Синхронизировать у родителя список child_page ссылок с фактическими детьми в БД */
async function syncChildLinks(parentId: string, ownerId: string) {
  const parent = await Page.findOne({ _id: parentId, userId: ownerId });
  if (!parent) return;

  const content = normalizeEditorContent(parent.content);

  // Только актуальные дети: не архив и не удалённые
  const children = await Page.find({
    parentId,
    userId: ownerId,
    archived: { $ne: true },
    deletedAt: null,
  })
    .select("_id")
    .lean();

  const childSet = new Set(children.map((c: any) => String(c._id)));
  const origBlocks: any[] = Array.isArray(content.blocks) ? (content.blocks as any[]) : [];

  // Убираем ссылки на отсутствующих
  const filtered: any[] = origBlocks.filter((b: any) => {
    if (b?.type !== "child_page") return true;
    return childSet.has(String(b?.data?.refId || ""));
  });

  // Добавляем недостающие
  const existing = new Set(
    filtered.filter((b: any) => b?.type === "child_page").map((b: any) => String(b.data.refId))
  );
  for (const c of children) {
    const id = String((c as any)._id);
    if (!existing.has(id)) filtered.push({ type: "child_page", data: { refId: id } });
  }

  const changed =
    filtered.length !== origBlocks.length ||
    filtered.some((b: any, i: number) => b !== origBlocks[i]);

  if (changed) {
    parent.content = { ...content, blocks: filtered };
    await parent.save();
  }
}

/** Собрать всех потомков (для каскадного удаления) */
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

/* ───────────────────────── handlers ───────────────────────── */

// GET /api/pages/:id
export async function GET(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  // Если это «ребёнок» — синхронизируем ссылки у родителя
  if (loaded.page.parentId) {
    await syncChildLinks(String(loaded.page.parentId), loaded.userId);
  }

  const fresh = await Page.findById(id);
  return NextResponse.json(fresh);
}

// PUT /api/pages/:id
export async function PUT(
  req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  try {
    const body = await req.json();

    // title
    if (typeof body?.title === "string") {
      loaded.page.title = body.title.trim();
    }

    // content (Editor.js)
      if (typeof body?.content !== "undefined") {
        loaded.page.content = normalizeEditorContent(body.content);
      }


    // properties — сохраняем только если поле прислано
    if (Object.prototype.hasOwnProperty.call(body, "properties")) {
      const { ok, value, error } = validateProperties(body.properties);
      if (!ok) {
        return NextResponse.json({ error: error || "Ошибка в свойствах" }, { status: 400 });
      }
      loaded.page.properties = value!;
    }

    await loaded.page.save();
    return NextResponse.json(loaded.page);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при обновлении страницы" },
      { status: 500 }
    );
  }
}

// DELETE /api/pages/:id
// Мягко (в корзину) + каскад; ?force=1 — удалить навсегда каскадом
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
