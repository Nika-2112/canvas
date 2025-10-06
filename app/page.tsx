/**
 * Главная страница приложения.
 *
 * Функционал:
 *  - Проверка авторизации пользователя.
 *  - Создание новой страницы (title + content).
 *  - Загрузка и отображение списка страниц текущего пользователя.
 *  - Переход к странице документа (/documents/[id]).
 *  - Удаление страницы (кнопка рядом с каждой записью).
 *  - Выход из системы.
 *
 * Примечания по реализации:
 *  - Для удаления используется переиспользуемый компонент DeletePageButton.
 *  - После удаления из списка выполняется локальная перезагрузка списка (loadPages()).
 *  - При создании допустим пустой заголовок: на бэкенде подставится "Без названия".
 */

"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import DeletePageButton from "@/components/DeletePageButton";

type PageItem = {
  _id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  // Поля content может не быть в ответе GET /api/pages (мы его не используем на списке).
};

export default function HomePage() {
  const { data: session, status } = useSession();

  // Локальное состояние страницы.
  const [pages, setPages] = useState<PageItem[]>([]);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [creating, setCreating] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  /**
   * Загрузка списка страниц пользователя.
   * Возвращаем только лёгкие поля (см. серверную проекцию): _id, title, createdAt.
   */
  const loadPages = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      if (!res.ok) {
        setPages([]);
        setError(data?.error || "Ошибка загрузки страниц");
      } else {
        setPages(Array.isArray(data) ? data : []);
      }
    } catch {
      setPages([]);
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Создание новой страницы.
   * Заголовок допускается пустым — сервер подставит безопасное значение.
   * content передаём как строку (для совместимости), можно и Editor.js JSON.
   */
  const createPage = async () => {
    if (creating) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Ошибка создания страницы");
      } else {
        setTitle("");
        setContent("");
        await loadPages(); // обновить список
      }
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setCreating(false);
    }
  };

  // Загрузка списка при успешной аутентификации.
  useEffect(() => {
    if (status === "authenticated") {
      loadPages();
    }
  }, [status]);

  // Служебные состояния.
  if (status === "loading") {
    return <div style={{ padding: 20 }}>Загрузка…</div>;
  }

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Вы не авторизованы</h1>
        <p>
          Пожалуйста, <a href="/login">войдите</a>, чтобы работать со страницами.
        </p>
      </div>
    );
  }

  // Основная разметка.
  return (
    <div style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Главная страница</h1>
        <div style={{ fontSize: 14, color: "#555" }}>
          Вы вошли как {session.user?.email}
        </div>
      </div>

      {/* Блок создания новой страницы */}
      <div style={{ marginBottom: 20, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ marginTop: 0 }}>Создать новую страницу</h2>

        <input
          type="text"
          placeholder="Заголовок"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 8,
            padding: 8,
            border: "1px solid #ddd",
            borderRadius: 6,
            outline: "none",
          }}
        />

        <textarea
          placeholder="Содержимое (необязательно)…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 8,
            padding: 8,
            minHeight: 80,
            border: "1px solid #ddd",
            borderRadius: 6,
            outline: "none",
          }}
        />

        <button
          onClick={createPage}
          disabled={creating}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: creating ? "#f5f5f5" : "#fff",
            cursor: creating ? "default" : "pointer",
          }}
        >
          {creating ? "Создание…" : "Создать страницу"}
        </button>
      </div>

      {/* Сообщение об ошибке, если есть */}
      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Список страниц */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Ваши страницы</h2>
        <button
          onClick={loadPages}
          disabled={loading}
          style={{
            padding: "6px 10px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: loading ? "#f5f5f5" : "#fff",
            cursor: loading ? "default" : "pointer",
            fontSize: 13,
          }}
          title="Обновить список"
        >
          {loading ? "Обновление…" : "Обновить"}
        </button>
      </div>

      {loading ? (
        <div style={{ color: "#666" }}>Загрузка списка…</div>
      ) : pages.length === 0 ? (
        <div style={{ color: "#666" }}>Страниц пока нет.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {pages.map((page) => (
            <li
              key={page._id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* Левая часть: ссылка и дата */}
              <div style={{ minWidth: 0 }}>
                <a
                  href={`/documents/${page._id}`}
                  style={{
                    fontWeight: 600,
                    textDecoration: "none",
                    color: "#0b57d0",
                    display: "inline-block",
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={page.title}
                >
                  {page.title || "Без названия"}
                </a>
                {page.createdAt && (
                  <div style={{ fontSize: 12, color: "#777", marginTop: 2 }}>
                    создано: {new Date(page.createdAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Правая часть: кнопка удаления */}
              <DeletePageButton
                pageId={page._id}
                onDeleted={loadPages} // после успешного удаления — перезагрузить список
              />
            </li>
          ))}
        </ul>
      )}

      {/* Кнопка выхода */}
      <div style={{ marginTop: 20 }}>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          style={{
            padding: "8px 12px",
            border: "1px solid #ccc",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
