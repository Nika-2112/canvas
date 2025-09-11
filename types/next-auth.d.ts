/**
 * Расширение типов NextAuth для добавления поля `id` в объект `user`.
 * Это нужно, чтобы TypeScript не ругался при обращении к session.user.id
 */

import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string; // добавляем id
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
  }
}
