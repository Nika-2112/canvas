/**
 * app/api/pages/[id]/route.ts
 *
 * - GET    : отдать страницу (свойства, контент, заголовок)
 * - PUT    : обновить title, content, properties (единый апдейт)
 * - DELETE : мягкое удаление каскадом (в корзину); ?force=1 — удалить навсегда
 *
 * Примечания:
 *  • params в App Router асинхронные — используем getIdParam(...)
 *  • properties валидируем мягко, сейчас поддержан тип "text"
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

/** Контент Editor.js — оставляем как есть, но гарантируем структуру */
function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

/** Мягкая валидация/нормализация свойств (поддержка "text") */
function normalizeProperties(input: any): { ok: true; value: any[] } | { ok: false; error: string } {
  if (input == null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Поле 'properties' должно быть массивом" };

  const out: any[] = [];
  for (const raw of input) {
    const id = String(raw?.id || "").trim();
    const name = String(raw?.name || "").trim() || "Без названия";
    const type = String(raw?.type || "text");

    if (!id) return { ok: false, error: "Свойство без id" };

    if (type === "text") {
      const value = raw?.value == null ? "" : String(raw.value);
      out.push({ id, name, type: "text", value });
      continue;
    }

    // неизвестные типы (на будущее) не валим — приводим к text
    out.push({ id, name, type: "text", value: raw?.value == null ? "" : String(raw.value) });
  }

  return { ok: true, value: out };
}

async function loadOwned(pageId: string) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) {
    return { error: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  }
  const page = await Page.findById(pageId);
  if (!page) {
    return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };
  }
  if (String(page.userId) !== String(userId)) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }
  return { page, userId };
}

// -------------------- GET --------------------
export async function GET(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const loaded = await loadOwned(id);
  if ("error" in loaded) return loaded.error;

  // отдаём страницу как есть
  return NextResponse.json(loaded.page);
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

    // title
    if (typeof body?.title === "string") {
      loaded.page.title = body.title.trim();
    }

    // content
    if (typeof body?.content !== "undefined") {
      loaded.page.content = normalizeEditorContent(body.content);
    }

    // properties (ВАЖНО: именно из общего PUT)
    if (typeof body?.properties !== "undefined") {
      const norm = normalizeProperties(body.properties);
      if (!("ok" in norm) || norm.ok !== true) {
        return NextResponse.json({ error: norm.error }, { status: 400 });
      }
      loaded.page.properties = norm.value;
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

  // собираем всех потомков (как раньше у тебя было)
  async function collectDescendants(rootId: string, ownerId: string): Promise<string[]> {
    const queue: string[] = [rootId];
    const out = new Set<string>();
    while (queue.length) {
      const cur = queue.shift() as string;
      const kids = await Page.find({ parentId: cur, userId: ownerId }).select("_id").lean();
      for (const k of kids) {
        const cid = String((k as any)._id);
        if (!out.has(cid)) {
          out.add(cid);
          queue.push(cid);
        }
      }
    }
    return Array.from(out);
  }

  const all = await collectDescendants(id, String(loaded.userId));
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

  return NextResponse.json({ success: true, deleted: ids.length, permanent: force });
}
