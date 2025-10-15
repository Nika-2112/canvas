/**
 * /api/pages/:id/properties
 * - GET: вернуть список свойств страницы
 * - PUT: полное обновление массива свойств (валидация типов + нормализация)
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";
import mongoose from "mongoose";

function validateProperties(input: any): { ok: boolean; value?: any[]; error?: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Ожидается массив свойств" };

  const normalized: any[] = [];
  for (const raw of input) {
    const id = String(raw?.id || "").trim();
    const name = String(raw?.name || "").trim();
    const type = String(raw?.type || "");
    let value = raw?.value;

    if (!id) return { ok: false, error: "Свойство без id" };
    if (!name) return { ok: false, error: "Свойство без name" };
    if (!["text", "number", "tags", "status", "date"].includes(type)) {
    return { ok: false, error: `Недопустимый тип свойства: ${type}` };
    }

    if (type === "status") {
    const allowed = ["Не начато", "В процессе", "Готово"];
    value = allowed.includes(value) ? value : "Не начато";
    } else if (type === "date") {
    // ожидаем { start: ISO, end?: ISO }
    if (value && typeof value === "object" && value.start) {
        value = {
        start: new Date(value.start).toISOString(),
        end: value.end ? new Date(value.end).toISOString() : null,
        };
    } else {
        value = { start: new Date().toISOString(), end: null };
    }
    }


    normalized.push({ id, name, type, value });
  }

  return { ok: true, value: normalized };
}

async function loadOwned(pageId: string) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) {
    return { err: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  }

  // ✅ валидируем ObjectId, чтобы не падать CastError'ом
  if (!mongoose.Types.ObjectId.isValid(pageId)) {
    return { err: NextResponse.json({ error: "Некорректный идентификатор страницы" }, { status: 400 }) };
  }

  const page = await Page.findById(pageId);
  if (!page) {
    return { err: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };
  }
  if (String(page.userId) !== String(userId)) {
    return { err: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }
  return { page, userId };
}

// ---------------- GET ----------------
// В Next 15 params — это Promise, поэтому ждём его
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { page, err } = await loadOwned(String(id));
  if (err) return err;
  return NextResponse.json(page!.properties || []);
}

// ---------------- PUT ----------------
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const { page, err } = await loadOwned(String(id));
  if (err) return err;

  try {
    const body = await req.json();
    const { ok, value, error } = validateProperties(body);
    if (!ok) return NextResponse.json({ error }, { status: 400 });

    page!.properties = value!;
    await page!.save();

    return NextResponse.json(page!.properties);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Ошибка сохранения свойств" },
      { status: 500 }
    );
  }
}
