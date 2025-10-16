/**
 * API /api/pages
 * - GET : возвращает активные страницы пользователя (не архив, не корзина)
 *         ?root=1 — только корневые
 * - POST: создать страницу/подстраницу + добавить child_page в родителя
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
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });
  

// В handler GET /api/pages
    const url = new URL(req.url);
    const shared = url.searchParams.get("shared") === "1";

    if (shared) {
      // вернуть только страницы, у которых есть участники
      const list = await Page.find({
        userId, // твой текущий фильтр владельца
        archived: { $ne: true },
        deletedAt: null,
        "members.0": { $exists: true }, // хотя бы один участник
      })
        .select("_id title")
        .lean();

      return NextResponse.json(list.map(p => ({ _id: String(p._id), title: p.title || "" })));
    }

  const rootOnly = url.searchParams.get("root") === "1";

  // 🔧 ключевая правка: archived: { $ne: true } (чтобы включить undefined)
  const baseFilter: any = { userId, archived: { $ne: true }, deletedAt: null };

  if (rootOnly) {
    const roots = await Page.find({
      ...baseFilter,
      $or: [{ parentId: null }, { parentId: { $exists: false } }],
    }).sort({ createdAt: 1 });
    return NextResponse.json(roots);
  }

  const pages = await Page.find(baseFilter).sort({ createdAt: -1 });
  return NextResponse.json(pages);
}


export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  try {
    const body = await req.json();
    const title = (body?.title ?? "").toString().trim() || "Новая страница";
    const content = typeof body?.content === "undefined"
      ? { time: Date.now(), version: "2.31.0", blocks: [] }
      : body.content;

    const parentId = body?.parentId ? String(body.parentId) : null;
    const projectId = body?.projectId ? String(body.projectId) : undefined;

    const newPage = await Page.create({
      userId,
      title,
      content,
      parentId,
      ...(projectId ? { projectId } : {}),
      archived: false,
      deletedAt: null,
    });

    // если подстраница — добавим блок-ссылку в родителя
    if (parentId) {
      const parent = await Page.findOne({ _id: parentId, userId });
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

    const plain = (newPage as any).toObject ? (newPage as any).toObject() : newPage;
    plain._id = String(plain._id);
    return NextResponse.json(plain, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Ошибка при создании страницы" }, { status: 500 });
  }
}
