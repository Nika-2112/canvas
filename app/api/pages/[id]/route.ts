/**
 * API для работы с конкретной страницей по идентификатору.
 * Расположение: /api/pages/[id]
 *
 * Поддерживаемые методы:
 *  - GET    : вернуть страницу (только для владельца);
 *  - PUT    : обновить title/content (content может быть объектом JSON);
 *  - DELETE : удалить страницу.
 *
 * Особенность Next.js 15:
 *   - объект params теперь является Promise, поэтому нужно использовать `await context.params`.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

// -------------------- GET --------------------
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }   // 👈 params — это Promise
) {
  const { id } = await context.params;          // 👈 обязательно await
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const page = await Page.findOne({ _id: id, userId: session.user.id });
  if (!page) {
    return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  }

  return NextResponse.json(page);
}

// -------------------- PUT --------------------
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;          // 👈 обязательно await
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const update: any = {};

    if (typeof body?.title === "string") update.title = body.title.trim();
    if (typeof body?.content !== "undefined") update.content = body.content;

    const page = await Page.findOneAndUpdate(
      { _id: id, userId: session.user.id },
      { $set: update },
      { new: true }
    );

    if (!page) {
      return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
    }

    return NextResponse.json(page);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Ошибка при обновлении страницы" },
      { status: 500 }
    );
  }
}

// -------------------- DELETE --------------------
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;          // 👈 обязательно await
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const res = await Page.findOneAndDelete({ _id: id, userId: session.user.id });
  if (!res) {
    return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
