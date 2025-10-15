/**
 * PATCH /api/pages/[id]/tags
 * Заменяет массив тегов у конкретной страницы.
 *
 * Обоснование (для диплома):
 *  - Теги позволяют быстро группировать подстраницы по тематике (логистика, маркетинг и др.).
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const { id } = await context.params;

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const body = await req.json();
  const tags = Array.isArray(body?.tags)
    ? body.tags.filter((t: any) => typeof t === "string")
    : [];

  const updated = await Page.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    { $set: { tags } },
    { new: true }
  );

  if (!updated) {
    return NextResponse.json({ error: "Страница не найдена" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
