// ./lib/acl.ts
import type { Session } from "next-auth";

/**
 * Лёгкий тип "плоского" проекта, чтобы TypeScript не путался.
 * Совпадает с нашей схемой Project:
 *  - userId: владелец
 *  - members: [{ userId, role: "editor" | "guest" }]
 */
export type ProjectLean = {
  _id: any;
  userId: any;
  scope?: "personal" | "shared";
  members?: Array<{ userId: any; role: "editor" | "guest" }>;
  archived?: boolean;
};

/** Удобный геттер userId из next-auth session */
export function getSessionUserId(session: Session | null | undefined): string | null {
  const u = session?.user as any;
  return (u?.id && String(u.id)) || null;
}

/** Является ли пользователь владельцем проекта */
export function isProjectOwner(project: ProjectLean, userId: string | null): boolean {
  if (!project || !userId) return false;
  return String(project.userId) === String(userId);
}

/** Роль пользователя в проекте (owner / editor / guest / null) */
export function roleInProject(project: ProjectLean, userId: string | null): "owner" | "editor" | "guest" | null {
  if (!project || !userId) return null;

  if (isProjectOwner(project, userId)) return "owner";

  const list = Array.isArray(project.members) ? project.members : [];
  const found = list.find((m) => String(m.userId) === String(userId));
  return found?.role || null;
}

/** Может ли пользователь хотя бы просматривать проект */
export function canViewProject(session: Session | null, project: ProjectLean): boolean {
  const uid = getSessionUserId(session);
  if (!uid) return false;

  // владелец видит всегда
  if (isProjectOwner(project, uid)) return true;

  // участники (editor/guest) видят
  const r = roleInProject(project, uid);
  return r === "editor" || r === "guest";
}

/** Может ли пользователь редактировать проект */
export function canEditProject(session: Session | null, project: ProjectLean): boolean {
  const uid = getSessionUserId(session);
  if (!uid) return false;

  // владелец всегда может править
  if (isProjectOwner(project, uid)) return true;

  // редактор может править
  const r = roleInProject(project, uid);
  return r === "editor";
}

/**
 * Может ли пользователь управлять участниками проекта (приглашать/удалять, менять роли).
 * По умолчанию — только владелец. Если хочешь разрешить админу — добавь проверку роли из session.user.role === 'admin'
 */
export function canManageMembers(session: Session | null, project: ProjectLean): boolean {
  const uid = getSessionUserId(session);
  if (!uid) return false;
  return isProjectOwner(project, uid);
}
