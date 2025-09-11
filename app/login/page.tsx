/**
 * Страница входа в систему.
 * Реализует форму авторизации (email + пароль) через Credentials Provider (NextAuth).
 * При успешном входе выполняется редирект на главную страницу.
 */

"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Вызов NextAuth Credentials Provider.
    // Примечание: для корректного UX используется callbackUrl,
    // по которому пользователь будет возвращён после входа.
    await signIn("credentials", {
      email: email.trim(),
      password: password.trim(),
      callbackUrl: "/",
      redirect: true,
    });
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "70vh", padding: 20 }}>
      <form
        onSubmit={handleSubmit}
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
          Вход
        </h1>

        <label style={{ display: "block", marginBottom: 6 }}>Email</label>
        <input
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

        <label style={{ display: "block", marginBottom: 6 }}>Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="••••••"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            marginBottom: 16,
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />

        <button
          type="submit"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #222",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          Войти
        </button>

        <div style={{ fontSize: 14 }}>
          Нет аккаунта?{" "}
          <a href="/register" style={{ textDecoration: "underline" }}>
            Зарегистрироваться
          </a>
        </div>
      </form>
    </div>
  );
}
