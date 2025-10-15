/**
 * API /api/pages/:id — устойчивые обработчики с унифицированной проверкой владельца.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

/** Тайпгард: params может быть объектом или Promise (зависит от версии Next). */
function isPromise<T = unknown>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as any).then === "function";
}
async function getIdParam(
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
): Promise<string> {
  const p = isPromise(context.params) ? await context.params : context.params;
  return String(p?.id || "");
}

async function requireOwner(pageId: string) {
  await connectDB();
  const session = await getSession();
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) {
    return { error: NextResponse.json({ error: "Необходима авторизация" }, { status: 401 }) };
  }

  const page = await Page.findById(pageId);
  if (!page) return { error: NextResponse.json({ error: "Страница не найдена" }, { status: 404 }) };

  // Унифицированное сравнение владельца
  if (String(page.userId) !== String(sessionUserId)) {
    return { error: NextResponse.json({ error: "Доступ запрещён" }, { status: 403 }) };
  }

  return { page, sessionUserId };
}

// -------------------- GET --------------------
export async function GET(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const { error, page } = await requireOwner(id);
  if (error) return error;
  return NextResponse.json(page);
}

// -------------------- PUT --------------------
export async function PUT(
  req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const guard = await requireOwner(id);
  if (guard.error) return guard.error;
  const { page } = guard;

  try {
    const body = await req.json();
    if (typeof body?.title === "string") page.title = body.title.trim();
    if (typeof body?.content !== "undefined") page.content = body.content;
    await page.save();
    return NextResponse.json(page);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при обновлении страницы" },
      { status: 500 }
    );
  }
}

// -------------------- DELETE --------------------
export async function DELETE(
  _req: Request,
  context: { params: { id: string } } | { params: Promise<{ id: string }> }
) {
  const id = await getIdParam(context);
  const guard = await requireOwner(id);
  if (guard.error) return guard.error;

  await Page.deleteOne({ _id: id });
  return NextResponse.json({ success: true });
}
