/**
 * API /api/pages
 * - GET:  ?root=1 — корневые страницы, иначе все страницы пользователя
 * - POST: создать страницу/подстраницу (и вставить child_page в конец родителя)
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] };
  }
  return raw;
}

export async function GET(req: Request) {
  await connectDB();
  const session = await getSession();
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rootOnly = url.searchParams.get("root") === "1";

  if (rootOnly) {
    const roots = await Page.find({
      userId: sessionUserId,
      $or: [{ parentId: null }, { parentId: { $exists: false } }],
    }).sort({ createdAt: 1 });
    return NextResponse.json(roots);
  }

  const pages = await Page.find({ userId: sessionUserId }).sort({ createdAt: -1 });
  return NextResponse.json(pages);
}

export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();
  const sessionUserId = getSessionUserId(session);
  if (!sessionUserId) {
    return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const rawTitle = (body?.title ?? "").toString();
    const title = rawTitle.trim() || "Без названия";

    const content =
      typeof body?.content === "undefined"
        ? { time: Date.now(), version: "2.31.0", blocks: [] }
        : body.content;

    const projectId = body?.projectId ? String(body.projectId) : undefined;
    const parentId = body?.parentId ? String(body.parentId) : undefined;
    const tags = Array.isArray(body?.tags)
      ? body.tags.filter((t: any) => typeof t === "string")
      : [];

    // 1) создаём документ страницы/подстраницы
    const newPage = await Page.create({
      userId: sessionUserId, // ← ключевой фикс: берём userId через универсальный хелпер
      title,
      content,
      ...(projectId ? { projectId } : {}),
      ...(parentId ? { parentId } : {}),
      tags,
    });

    // 2) если это подстраница — вставляем блок child_page в конец контента родителя
    if (parentId) {
      const parent = await Page.findOne({ _id: parentId, userId: sessionUserId });
      if (parent) {
        const normalized = normalizeEditorContent(parent.content);
        normalized.blocks.push({
          type: "child_page",
          data: { refId: String(newPage._id) },
        });
        parent.content = normalized;
        await parent.save();
      }
    }

    // 3) возвращаем «плоский» объект с id строкой (устойчиво к редиректам)
    const plain = (newPage as any).toObject ? (newPage as any).toObject() : newPage;
    plain._id = String(plain._id);
    return NextResponse.json(plain, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Ошибка при создании страницы" },
      { status: 500 }
    );
  }
}
