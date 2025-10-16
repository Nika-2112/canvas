// components/PageAssignees.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

type Assignee = { _id: string; username: string; role: "admin" | "editor" | "guest"; isActive: boolean };
type ProjectMembersResponse = {
  ownerId: string;
  members: Array<{ userId: string; role: "editor" | "guest" }>;
  users: Array<{ _id: string; username: string; role: "admin" | "editor"; isActive: boolean }>;
};

export default function PageAssignees({ pageId }: { pageId: string }) {
  const { data: session } = useSession();
  const myRole = (session?.user as any)?.role as "admin" | "editor" | "guest" | undefined;

  const [title, setTitle] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [members, setMembers] = useState<ProjectMembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const canEdit = myRole === "admin" || myRole === "editor";

  async function loadPage() {
    const res = await fetch(`/api/pages/${pageId}`);
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || "Не удалось загрузить страницу");
    setTitle(d?.title || "");
    setProjectId(d?.projectId || null);
  }

  async function loadAssignees() {
    const r = await fetch(`/api/pages/${pageId}/assignees`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || "Не удалось загрузить исполнителей");
    setAssignees(Array.isArray(d) ? d : []);
  }

  async function loadMembers(pid: string) {
    const r = await fetch(`/api/projects/${pid}/members`);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error || "Не удалось загрузить участников проекта");
    setMembers(d as ProjectMembersResponse);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr("");
        await loadPage();
      } catch (e:any) {
        setErr(e.message || "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, [pageId]);

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      try {
        await loadAssignees();
      } catch (e:any) {
        console.error(e);
      }
    })();
  }, [pageId]);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        await loadMembers(projectId);
      } catch (e:any) {
        console.error(e);
      }
    })();
  }, [projectId]);

  const allowedUsers: Array<{ _id: string; username: string }> = useMemo(() => {
    if (!members) return [];
    const map = new Map<string, string>();
    // владелец
    const owner = members.users.find(u => u._id === members.ownerId);
    if (owner) map.set(owner._id, owner.username);
    // участники
    for (const m of members.members) {
      const u = members.users.find(x => x._id === m.userId);
      if (u) map.set(u._id, u.username);
    }
    return Array.from(map.entries()).map(([id, username]) => ({ _id: id, username }));
  }, [members]);

  async function addAssignee(targetUserId: string) {
    if (!canEdit) return;
    const res = await fetch(`/api/pages/${pageId}/assignees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d?.error || "Не удалось назначить исполнителя");
      return;
    }
    await loadAssignees();
  }

  async function removeAssignee(targetUserId: string) {
    if (!canEdit) return;
    const res = await fetch(`/api/pages/${pageId}/assignees?userId=${encodeURIComponent(targetUserId)}`, {
      method: "DELETE",
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d?.error || "Не удалось снять исполнителя");
      return;
    }
    await loadAssignees();
  }

  // тех. состояния
  if (loading) return <div className="text-sm text-gray-500 mb-2">Исполнители: загрузка…</div>;
  if (err) return <div className="text-sm text-red-600 mb-2">Ошибка: {err}</div>;

  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Исполнители</div>

      {/* чипсы текущих исполнителей */}
      <div className="flex flex-wrap gap-2">
        {assignees.map(a => (
          <span key={a._id} className="inline-flex items-center gap-2 px-2 py-1 rounded-full border">
            @{a.username}
            {canEdit && (
              <button
                className="text-gray-500 hover:text-black"
                title="Убрать"
                onClick={() => removeAssignee(a._id)}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {assignees.length === 0 && (
          <span className="text-sm text-gray-500">Никто не назначен</span>
        )}
      </div>

      {/* селект добавления — только участники проекта */}
      {canEdit && projectId && (
        <div className="mt-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            defaultValue=""
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v) addAssignee(v);
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>+ назначить пользователя…</option>
            {allowedUsers
              .filter(u => !assignees.some(a => a._id === u._id))
              .map(u => (
                <option key={u._id} value={u._id}>
                  @{u.username}
                </option>
              ))}
          </select>
        </div>
      )}

      {!projectId && (
        <div className="text-xs text-amber-700 mt-1">
          Страница не привязана к проекту — назначить можно только владельца страницы.
        </div>
      )}
      {!canEdit && (
        <div className="text-xs text-gray-500 mt-1">
          У вас нет прав изменять исполнителей.
        </div>
      )}
    </div>
  );
}
