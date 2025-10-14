/**
 * API /api/pages
 * - GET  : вернуть страницы текущего пользователя
 * - POST : создать новую страницу (title, content[, projectId])
 *
 * Примечание:
 *  - content может быть строкой или объектом Editor.js (JSON).
 *  - projectId — опционально, ссылка на Project._id.
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

export async function GET() {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const pages = await Page.find({ userId: session.user.id }).sort({ createdAt: -1 });
  return NextResponse.json(pages);
}

export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const rawTitle = (body?.title ?? "").toString();
    const title = rawTitle.trim();
    if (!title) {
      return NextResponse.json({ error: "Заголовок обязателен" }, { status: 400 });
    }

    // content может быть строкой или объектом Editor.js
    const content = body?.content ?? { blocks: [] };

    // projectId — опционально
    const projectId = body?.projectId ? String(body.projectId) : undefined;

    const newPage = await Page.create({
      userId: session.user.id,
      title,
      content,
      ...(projectId ? { projectId } : {}),
    });

    return NextResponse.json(newPage, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при создании страницы" },
      { status: 500 }
    );
  }
}
