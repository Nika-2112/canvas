// components/ProjectMembers.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Member = {
  userId: string;
  username: string | null;
  email: string | null;
  role: "editor" | "guest";
};

type SearchUser = {
  id: string;
  username: string;
  email: string | null;
  role: "admin" | "editor" | "guest";
};

export default function ProjectMembers({ projectId }: { projectId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [openAdd, setOpenAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState<"editor" | "guest">("editor");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/projects/${projectId}/members`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Ошибка загрузки участников");
      setMembers(Array.isArray(d?.items) ? d.items : []);
      setCanManage(!!d?.canManage);
    } catch (e: any) {
      setErr(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // 🔎 Поиск (дебаунс 300мс)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!openAdd) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!query.trim()) { setSearch([]); return; }
      try {
        setSearching(true);
        const r = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        setSearch(Array.isArray(d) ? d : []);
      } catch {
        setSearch([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, openAdd]);

  const add = async (userId: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: inviteRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Не удалось добавить участника");
      setOpenAdd(false);
      setQuery("");
      setSearch([]);
      await load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  const changeRole = async (userId: string, role: "editor" | "guest") => {
    try {
      const r = await fetch(`/api/projects/${projectId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Не удалось изменить роль");
      await load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  const remove = async (userId: string) => {
    if (!confirm("Удалить участника?")) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Не удалось удалить участника");
      await load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  };

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Участники</div>
        {canManage && (
          <button className="text-xs px-2 py-1 rounded border hover:bg-gray-50" onClick={() => setOpenAdd(true)}>
            + Добавить
          </button>
        )}
      </div>

      {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
      {loading && <div className="text-xs text-gray-500 mt-1">Загрузка…</div>}

      {!loading && members.length === 0 && (
        <div className="text-xs text-gray-500 mt-1">Пока никого нет</div>
      )}

      {/* Список фишек */}
      <div className="mt-2 flex flex-wrap gap-2">
        {members.map((m) => {
          const initial = (m.username || m.email || "U").trim().charAt(0).toUpperCase();
          return (
            <div key={m.userId} className="flex items-center gap-2 border rounded-full px-2 py-1">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[11px]">
                {initial}
              </div>
              <div className="text-xs">
                <div className="font-medium">{m.username || m.email || "Пользователь"}</div>
                <div className="text-gray-500">{m.role === "editor" ? "Редактор" : "Гость"}</div>
              </div>

              {/* Управление: только если есть права */}
              {canManage && (
                <div className="flex items-center gap-1 ml-2">
                  <select
                    className="text-xs border rounded px-1 py-0.5"
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.currentTarget.value as "editor" | "guest")}
                  >
                    <option value="editor">editor</option>
                    <option value="guest">guest</option>
                  </select>
                  <button
                    className="text-xs px-2 py-0.5 rounded border border-red-300 text-red-600"
                    onClick={() => remove(m.userId)}
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Модалка "Добавить" */}
      {openAdd && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[300]">
          <div className="bg-white rounded-xl shadow-lg p-4 w-[420px]">
            <h2 className="text-lg font-semibold mb-3">Добавить участника</h2>

            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">Роль</div>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.currentTarget.value as any)}
                >
                  <option value="editor">editor (может редактировать)</option>
                  <option value="guest">guest (только просмотр)</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-gray-600 mb-1">Найти пользователя (логин)</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="начните вводить логин…"
                />
              </div>

              <div className="border rounded p-2 max-h-48 overflow-auto">
                {searching && <div className="text-xs text-gray-500">Поиск…</div>}
                {!searching && search.length === 0 && query.trim() && (
                  <div className="text-xs text-gray-500">Ничего не найдено</div>
                )}
                {!searching && search.map((u) => (
                  <div key={u.id} className="flex items-center justify-between py-1">
                    <div className="text-sm">
                      <div className="font-medium">{u.username}</div>
                      <div className="text-xs text-gray-500">{u.role}</div>
                    </div>
                    <button
                      className="text-xs px-2 py-0.5 rounded border hover:bg-gray-50"
                      onClick={() => add(u.id)}
                    >
                      Добавить
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded border" onClick={() => setOpenAdd(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
