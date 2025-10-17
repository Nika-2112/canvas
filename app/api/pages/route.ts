/**
 * API /api/pages
 * - GET :
 *    • ?root=1   — только корневые
 *    • ?shared=1 — «общие»: страницы с участниками ИЛИ страницы в проектах, где есть участники,
 *                  видит владелец ИЛИ участник страницы ИЛИ участник проекта
 *    • без shared — «личные» (без участников и без проекта), только владелец
 * - POST: создать страницу/подстраницу + вставить child_page в родителя
 *    • если родитель «общий», подстраница наследует его участников и projectId
 */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { Page } from "@/models/Page";
import { Project } from "@/models/Project";
import { getSession } from "@/lib/auth";
import { getSessionUserId } from "@/lib/session-user";

type MemberLean = { userId: any; role: "editor" | "guest" };
type PageLean = {
  _id: any;
  title?: string;
  parentId?: any | null;
  userId: any;
  members?: MemberLean[];
  archived?: boolean;
  deletedAt?: any;
  projectId?: any | null;
  content?: any;
};
type ParentLean = {
  _id?: any;
  userId: any;
  members?: MemberLean[];
  projectId?: any | null;
  content: any;
};

/** Мини-тип для отдачи списка в сайдбар: нам нужны только эти поля */
type PageListItem = { _id: any; title?: string; parentId?: any | null };

function normalizeEditorContent(raw: any) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.blocks)) {
    return { time: Date.now(), version: "2.31.0", blocks: [] as any[] };
  }
  return raw;
}

/* ───────── GET ───────── */
export async function GET(req: Request) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  const url = new URL(req.url);
  const rootOnly = url.searchParams.get("root") === "1";
  const shared = url.searchParams.get("shared") === "1";

  const base = { archived: { $ne: true }, deletedAt: null } as const;
  const parentFilter = rootOnly
    ? { $or: [{ parentId: null }, { parentId: { $exists: false } }] }
    : {};

  if (shared) {
    // Найдём проекты, в которых пользователь — владелец или участник
    const myProjectsRaw = await Project.find({
      $or: [{ userId }, { "members.userId": userId }],
    })
      .select("_id")
      .lean();

    const projectIds = (myProjectsRaw as Array<{ _id: any }>).map((p) => p._id); // ObjectId[]

    // «Общие» включают:
    //  A) страницы с участниками (и я — владелец/участник),
    //  B) страницы, принадлежащие одному из моих проектов (даже если у самой страницы нет members)
    const listRaw = await Page.find({
      ...base,
      ...parentFilter,
      $or: [
        {
          "members.0": { $exists: true },
          $or: [{ userId }, { "members.userId": userId }],
        },
        {
          projectId: { $in: projectIds },
        },
      ],
    })
      .select("_id title parentId userId members projectId")
      .sort({ createdAt: 1 })
      .lean();

    // Приводим к типу для списка (минимальный набор полей)
    const list = listRaw as unknown as PageListItem[];

    return NextResponse.json(
      list.map((p) => ({
        _id: String(p._id),
        title: p.title || "",
        parentId: p.parentId ? String(p.parentId) : null,
      }))
    );
  }

  // «Личные»: только владельца, без участников И без projectId
  const pagesRaw = await Page.find({
    ...base,
    ...parentFilter,
    userId,
    "members.0": { $exists: false },
    $or: [{ projectId: null }, { projectId: { $exists: false } }],
  })
    .select("_id title parentId")
    .sort({ createdAt: rootOnly ? 1 : -1 })
    .lean();

  const pages = pagesRaw as unknown as PageListItem[];

  return NextResponse.json(
    pages.map((p) => ({
      _id: String(p._id),
      title: p.title || "",
      parentId: p.parentId ? String(p.parentId) : null,
    }))
  );
}

/* ───────── POST ───────── */
export async function POST(req: Request) {
  await connectDB();
  const session = await getSession();
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Необходима авторизация" }, { status: 401 });

  try {
    const body = await req.json();
    let { title = "", parentId = null, projectId: incomingProjectId = null } = body;
    title = (typeof title === "string" ? title.trim() : "") || "Без названия";

    const content =
      typeof body?.content === "undefined"
        ? { time: Date.now(), version: "2.31.0", blocks: [] as any[] }
        : body.content;

    const pageData: any = {
      userId,
      title,
      content,
      parentId: parentId || undefined,
      archived: false,
      deletedAt: null,
    };

    let inheritedProjectId: string | null = incomingProjectId;

    // === КОРНЕВАЯ страница внутри проекта (parentId нет, но projectId пришёл) ===
    if (!parentId && incomingProjectId) {
      const project = await Project.findOne({
        _id: incomingProjectId,
        $or: [{ userId }, { "members.userId": userId }],
      })
        .select("_id members")
        .lean();

      if (!project) {
        return NextResponse.json({ error: "Нет прав создавать в этом проекте" }, { status: 403 });
      }

      pageData.projectId = (project as any)._id; // ObjectId

      if (Array.isArray((project as any).members) && (project as any).members.length > 0) {
        pageData.members = (project as any).members.map(
          (m: MemberLean) => ({
            userId: m.userId, // ObjectId (НЕ String)
            role: m.role === "guest" ? "guest" : "editor",
          })
        );
      }
    }

    // если создаём подстраницу — валидируем и наследуем участников/проект
    if (parentId) {
      const parent = await Page.findOne({
        _id: parentId,
        archived: { $ne: true },
        deletedAt: null,
      })
        .select("userId members projectId content")
        .lean<ParentLean>();

      if (!parent) {
        return NextResponse.json({ error: "Родитель не найден" }, { status: 404 });
      }

      const amOwner = String(parent.userId) === String(userId);
      const amMember = Array.isArray(parent.members)
        ? parent.members.some((m: MemberLean) => String(m.userId) === String(userId))
        : false;

      const isAdmin = (session?.user as any)?.role === "admin";
      if (!amOwner && !amMember && !isAdmin) {
        return NextResponse.json({ error: "Нет прав для создания подстраницы" }, { status: 403 });
      }

      if (Array.isArray(parent.members) && parent.members.length > 0) {
        pageData.members = parent.members.map((m: MemberLean) => ({
          userId: m.userId, // ObjectId
          role: m.role === "guest" ? "guest" : "editor",
        }));
      }

      if (parent.projectId) {
        pageData.projectId = parent.projectId; // ObjectId
      }
    }

    // если projectId ещё не выставлен — берём из входного или null
    if (typeof pageData.projectId === "undefined") {
      pageData.projectId = inheritedProjectId || incomingProjectId || null;
    }

    const newPage = await Page.create(pageData);

    // если это подстраница — добавим child_page в контент родителя
    if (parentId) {
      const parentDoc = await Page.findById(parentId);
      if (parentDoc) {
        const normalized = normalizeEditorContent(parentDoc.content);
        normalized.blocks.push({
          type: "child_page",
          data: { refId: String(newPage._id) },
        });
        parentDoc.content = normalized;
        await parentDoc.save();
      }
    }

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
