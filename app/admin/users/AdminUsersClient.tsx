"use client";

import { useEffect, useState } from "react";

type VisibleRole = "editor" | "guest";                // роли, доступные в UI
type Row = {
  _id: string;
  username: string;
  email?: string | null;
  role: "admin" | "editor" | "guest";                 // что может прийти из API
  isActive: boolean;
};

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

export default function AdminUsersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  // форма создания
  const [openNew, setOpenNew] = useState(false);
  const [nLogin, setNLogin] = useState("");
  const [nPass, setNPass] = useState("");
  const [nRole, setNRole] = useState<VisibleRole>("guest");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/users", { cache: "no-store" });
      const d = await safeJson(r);
      if (!r.ok) throw new Error((d as any)?.error || "Ошибка загрузки");
      // ❗️прячем админа из списка
      const onlyNonAdmins = (Array.isArray(d) ? d as Row[] : []).filter(u => u.role !== "admin");
      setRows(onlyNonAdmins);
    } catch (e: any) {
      setErr(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  async function createUser() {
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nLogin.trim(),
          password: nPass.trim(),
          role: nRole,                               // создаём как editor/guest
        }),
      });
      const d = await safeJson(r);
      if (!r.ok) throw new Error((d as any)?.error || "Не удалось создать");
      setOpenNew(false);
      setNLogin(""); setNPass(""); setNRole("guest");
      load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  }

  async function updateUser(id: string, patch: Partial<Row> & { password?: string }) {
    try {
      // ✅ страхуемся: если кто-то попытается подсунуть admin, выкидываем
      if (patch.role && patch.role !== "editor" && patch.role !== "guest") {
        throw new Error("Недопустимая роль");
      }

      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      // иногда API может вернуть пустой ответ — обрабатываем корректно
      let d: any = null;
      try { d = await r.clone().json(); } catch { /* ignore */ }

      if (!r.ok) {
        const message = d?.error || (await r.text().catch(() => "")) || "Не удалось сохранить";
        throw new Error(message);
      }
      load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  }

  async function removeUser(id: string) {
    if (!confirm("Удалить пользователя?")) return;
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      let d: any = null;
      try { d = await r.clone().json(); } catch { /* ignore */ }
      if (!r.ok) {
        const message = d?.error || (await r.text().catch(() => "")) || "Не удалось удалить";
        throw new Error(message);
      }
      load();
    } catch (e: any) {
      alert(e.message || "Ошибка");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          className="px-3 py-1.5 rounded border bg-black text-white"
          onClick={() => setOpenNew(true)}
        >
          Новый пользователь
        </button>
        <button className="px-3 py-1.5 rounded border" onClick={load}>Обновить</button>
      </div>

      {err && <div className="text-red-600 text-sm">{err}</div>}
      {loading && <div className="text-sm text-gray-500">Загрузка…</div>}

      {!loading && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">Логин</th>
                <th className="px-3 py-2">Роль</th>
                <th className="px-3 py-2">Статус</th>
                <th className="px-3 py-2 w-64">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(u => (
                <tr key={u._id} className="border-t">
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={u.role as VisibleRole}
                      onChange={(e) =>
                        updateUser(u._id, { role: e.currentTarget.value as VisibleRole })
                      }
                    >
                      <option value="editor">editor</option>
                      <option value="guest">guest</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className={
                        "px-2 py-1 rounded border " +
                        (u.isActive ? "bg-green-50" : "bg-gray-50")
                      }
                      onClick={() => updateUser(u._id, { isActive: !u.isActive })}
                    >
                      {u.isActive ? "Активен" : "Выключен"}
                    </button>
                  </td>
                  <td className="px-3 py-2 flex gap-2">
                    <button
                      className="px-2 py-1 rounded border"
                      onClick={() => {
                        const p = prompt("Новый пароль (оставь пустым, чтобы отменить):", "");
                        if (p && p.trim()) updateUser(u._id, { password: p.trim() });
                      }}
                    >
                      Сброс пароля
                    </button>
                    <button
                      className="px-2 py-1 rounded border border-red-400 text-red-600"
                      onClick={() => removeUser(u._id)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-gray-500" colSpan={4}>
                    Пользователей пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {openNew && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[300]">
          <div className="bg-white rounded-xl shadow-lg p-4 w-[420px]">
            <h2 className="text-lg font-semibold mb-3">Новый пользователь</h2>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-gray-600 mb-1">Логин</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={nLogin}
                  onChange={e => setNLogin(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Пароль</div>
                <input
                  className="w-full border rounded px-2 py-1"
                  type="password"
                  value={nPass}
                  onChange={e => setNPass(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-600 mb-1">Роль</div>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={nRole}
                  onChange={(e) => setNRole(e.currentTarget.value as VisibleRole)}
                >
                  <option value="editor">editor</option>
                  <option value="guest">guest</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="px-3 py-1.5 rounded border" onClick={() => setOpenNew(false)}>
                Отмена
              </button>
              <button className="px-3 py-1.5 rounded border bg-black text-white" onClick={createUser}>
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
