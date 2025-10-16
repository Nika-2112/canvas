// components/PageAssignees.tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type UserItem = {
  _id: string;
  username: string;
  role: "admin" | "editor" | "guest";
  isActive: boolean;
};

export default function PageAssignees({ pageId }: { pageId: string }) {
  const { data: session } = useSession();
  const myRole = (session?.user as any)?.role || "guest";

  const [assignees, setAssignees] = useState<UserItem[]>([]);
  const [members, setMembers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const canEdit = myRole === "admin" || myRole === "editor";

  // загружаем участников страницы
  async function loadMembers() {
    const res = await fetch(`/api/pages/${pageId}/members`);
    if (!res.ok) {
      setMembers([]);
      return;
    }
    const d = await res.json();
    setMembers(Array.isArray(d) ? d : []);
  }

  // загружаем исполнителей
  async function loadAssignees() {
    const res = await fetch(`/api/pages/${pageId}/assignees`);
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error || "Не удалось загрузить исполнителей");
    setAssignees(Array.isArray(d) ? d : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadMembers();
        await loadAssignees();
      } catch (e: any) {
        setErr(e.message || "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, [pageId]);

  // добавить исполнителя
  async function addAssignee(userId: string) {
    const res = await fetch(`/api/pages/${pageId}/assignees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d?.error || "Ошибка при назначении исполнителя");
      return;
    }
    await loadAssignees();
  }

  // удалить исполнителя
  async function removeAssignee(userId: string) {
    const res = await fetch(`/api/pages/${pageId}/assignees?userId=${userId}`, {
      method: "DELETE",
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d?.error || "Ошибка при снятии исполнителя");
      return;
    }
    await loadAssignees();
  }

  // если страница без участников → ничего не рендерим
  if (!loading && members.length === 0) {
    return null;
  }

  if (loading) return <div className="text-sm text-gray-500 mb-2">Загрузка исполнителей…</div>;
  if (err) return <div className="text-sm text-red-600 mb-2">Ошибка: {err}</div>;

  return (
    <div className="mb-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Исполнители</div>

      {/* текущие исполнители */}
      <div className="flex flex-wrap gap-2">
        {assignees.length > 0 ? (
          assignees.map((a) => (
            <span
              key={a._id}
              className="inline-flex items-center gap-2 px-2 py-1 rounded-full border"
            >
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
          ))
        ) : (
          <span className="text-sm text-gray-500">Никто не назначен</span>
        )}
      </div>

      {/* выбор из участников */}
      {canEdit && members.length > 0 && (
        <div className="mt-2">
          <select
            className="border rounded px-2 py-1 text-sm"
            defaultValue=""
            onChange={(e) => {
              const id = e.currentTarget.value;
              if (id) addAssignee(id);
              e.currentTarget.value = "";
            }}
          >
            <option value="" disabled>
              + Назначить исполнителя…
            </option>
            {members
              .filter((u) => !assignees.some((a) => a._id === u._id))
              .map((u) => (
                <option key={u._id} value={u._id}>
                  @{u.username}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
}
