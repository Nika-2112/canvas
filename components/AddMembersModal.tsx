"use client";
import { useEffect, useState } from "react";

type UserRow = { _id: string; username: string; role: "editor" | "guest"; isActive: boolean };

export default function AddMembersModal({
  pageId,
  onClose,
  onChanged,
}: {
  pageId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await fetch("/api/admin/users?all=1", { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Не удалось загрузить пользователей");
        const arr = Array.isArray(d) ? d : [];
        arr.sort((a: any, b: any) => String(a.username).localeCompare(String(b.username), "ru"));
        setUsers(
          arr
            .filter((u: any) => u.role === "editor" || u.role === "guest")
            .map((u: any) => ({
              _id: String(u._id),
              username: u.username,
              role: u.role,
              isActive: u.isActive !== false,
            }))
        );
      } catch (e: any) {
        setErr(e.message || "Ошибка");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function addMember() {
    if (!selected) return;
    try {
      const r = await fetch(`/api/pages/${pageId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Не удалось добавить участника");
      onChanged();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[300]">
      <div className="bg-white rounded-xl shadow-lg p-4 w-[420px]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Добавить участника</h2>
          <button onClick={onClose} className="px-2 py-1 rounded border">✕</button>
        </div>

        {loading && <div className="text-gray-500 text-sm">Загрузка…</div>}
        {err && <div className="text-red-600 text-sm">{err}</div>}

        {!loading && !err && (
          <>
            <div className="mb-3">
              <select
                className="w-full border rounded px-2 py-1"
                value={selected || ""}
                onChange={(e) => setSelected(e.currentTarget.value || null)}
              >
                <option value="">— выберите пользователя —</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.username} {u.role === "guest" ? "(гость)" : "(редактор)"}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded border" onClick={onClose}>Отмена</button>
              <button className="px-3 py-1.5 rounded border bg-black text-white" onClick={addMember}>
                Добавить
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
