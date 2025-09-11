/**
 * Главная страница приложения.
 * Функционал:
 *  - проверка авторизации;
 *  - форма для создания страницы (title + content);
 *  - список страниц текущего пользователя;
 *  - ссылки на просмотр отдельных страниц (/documents/[id]);
 *  - кнопка выхода.
 */

"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";

export default function HomePage() {
  const { data: session, status } = useSession();

  // Локальное состояние
  const [pages, setPages] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  // Загрузка списка страниц
  const loadPages = async () => {
    try {
      const res = await fetch("/api/pages");
      const data = await res.json();
      if (res.ok) {
        setPages(data);
      } else {
        setError(data.error || "Ошибка загрузки страниц");
      }
    } catch {
      setError("Ошибка соединения с сервером");
    }
  };

  // Создание новой страницы
  const createPage = async () => {
    setError("");
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      const data = await res.json();
      if (res.ok) {
        setTitle("");
        setContent("");
        loadPages(); // обновляем список
      } else {
        setError(data.error || "Ошибка создания страницы");
      }
    } catch {
      setError("Ошибка соединения с сервером");
    }
  };

  // Загружаем страницы при входе
  useEffect(() => {
    if (status === "authenticated") {
      loadPages();
    }
  }, [status]);

  if (status === "loading") {
    return <p style={{ padding: 20 }}>Загрузка...</p>;
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

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <h1>Главная страница</h1>
      <p>Вы вошли как {session.user?.email}</p>

      {/* Форма создания страницы */}
      <div style={{ marginBottom: 20, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Создать новую страницу</h2>
        <input
          type="text"
          placeholder="Заголовок"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ width: "100%", marginBottom: 8, padding: 8 }}
        />
        <textarea
          placeholder="Содержимое..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ width: "100%", marginBottom: 8, padding: 8, minHeight: 80 }}
        />
        <button onClick={createPage} style={{ padding: "8px 12px" }}>
          Создать страницу
        </button>
      </div>

      {/* Ошибки */}
      {error && (
        <div style={{ color: "red", marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Список страниц */}
      <h2>Ваши страницы</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
        {pages.map((page) => (
          <li
            key={page._id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
            }}
          >
            {/* ссылка на просмотр */}
            <a
              href={`/documents/${page._id}`}
              style={{ fontWeight: "bold", textDecoration: "none", color: "#000" }}
            >
              {page.title}
            </a>
            <div style={{ fontSize: 14, color: "#666" }}>
              {typeof page.content === "string" && page.content}
              {typeof page.content === "object" && page.content?.blocks && (
                <span>[Блоковый контент]</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#aaa" }}>
              Создано: {new Date(page.createdAt).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>


      {/* Кнопка выхода */}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ marginTop: 20 }}
      >
        Выйти
      </button>
    </div>
  );
}
