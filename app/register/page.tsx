/**
 * Страница регистрации нового пользователя.
 * Назначение: обеспечить создание учётной записи без использования внешних инструментов (curl/Postman),
 * непосредственно из графического интерфейса веб-приложения.
 *
 * Функциональные требования:
 *  - форма с полями email и пароль;
 *  - валидация (минимальная) на клиентской стороне;
 *  - отправка запроса в API /api/register;
 *  - корректная обработка ошибок (отображение пользователю);
 *  - редирект на страницу входа /login после успешной регистрации;
 *  - запрет отображения формы уже авторизованным пользователям (редирект на главную).
 *
 * Примечание по архитектуре:
 *  Используется App Router (Next.js 13+). Компонент помечен как Client Component (директива "use client"),
 *  поскольку применяются хуки состояния и взаимодействие с API из браузера.
 */

"use client";

import { FormEvent, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function RegisterPage() {
  // Хук сессии: если пользователь уже авторизован, регистрация не требуется.
  const { data: session, status } = useSession();
  const router = useRouter();

  // Локальное состояние формы и состояния запроса.
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");       // текст ошибки для пользователя
  const [pending, setPending] = useState<boolean>(false); // индикатор выполнения запроса

  // Если пользователь авторизован — перенаправление на главную.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  // Минимальная клиентская валидация (дополняет серверную).
  const validate = (): string | null => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      return "Укажите email и пароль.";
    }
    // Базовая проверка формата email (упрощённая).
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      return "Некорректный формат email.";
    }
    // Минимальная длина пароля. Сервер также будет проверять (защита от обхода).
    if (trimmedPassword.length < 6) {
      return "Пароль должен содержать не менее 6 символов.";
    }
    return null;
  };

  // Обработчик отправки формы.
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setPending(true);
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // NB: используем trim для исключения лишних пробелов
        body: JSON.stringify({ email: email.trim(), password: password.trim() }),
      });

      if (res.ok) {
        // После успешной регистрации направляем пользователя на страницу входа.
        router.push("/login");
        return;
      }

      // При ошибке API возвращает объект { error: "..." }.
      const data = await res.json().catch(() => ({}));
      setError(data?.error || "Ошибка регистрации. Повторите попытку позже.");
    } catch {
      setError("Ошибка соединения с сервером.");
    } finally {
      setPending(false);
    }
  };

  // Состояние "загрузка" для страницы (например, состояние определения сессии).
  if (status === "loading") {
    return <div style={{ padding: 20 }}>Загрузка…</div>;
  }

  // Если пользователь авторизован — форма регистрации не отображается.
  if (status === "authenticated") {
    return null;
  }

  // UI формы регистрации (минималистичный, под белую тему).
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 20 }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          maxWidth: "90vw",
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 24,
          background: "#fff",
          boxShadow: "0 6px 24px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 16, fontSize: 22, fontWeight: 600 }}>
          Регистрация
        </h1>

        <label htmlFor="email" style={{ display: "block", marginBottom: 6 }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          placeholder="you@example.com"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 12,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />

        <label htmlFor="password" style={{ display: "block", marginBottom: 6 }}>
          Пароль
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="••••••"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 12,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />

        {error && (
          <div
            role="alert"
            style={{
              background: "#fff3f3",
              border: "1px solid #ffd6d6",
              color: "#a40000",
              borderRadius: 8,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #222",
            background: pending ? "#f3f3f3" : "#111",
            color: pending ? "#999" : "#fff",
            cursor: pending ? "not-allowed" : "pointer",
            fontWeight: 600,
            marginTop: 4,
            marginBottom: 12,
          }}
        >
          {pending ? "Регистрация…" : "Зарегистрироваться"}
        </button>

        <div style={{ fontSize: 14 }}>
          Уже есть аккаунт?{" "}
          <a href="/login" style={{ textDecoration: "underline" }}>
            Войти
          </a>
        </div>
      </form>
    </div>
  );
}
