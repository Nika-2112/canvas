/**
 * Вспомогательная функция для получения текущей сессии пользователя.
 * Использует NextAuth (Auth.js) и возвращает данные из JWT.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function getSession() {
  return await getServerSession(authOptions);
}
