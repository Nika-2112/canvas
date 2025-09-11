/**
 * Конфигурация NextAuth для авторизации пользователей через email и пароль.
 * Используется CredentialsProvider. Для корректной работы сессии
 * дополнительно настроены callbacks для добавления user.id в JWT и Session.
 */

import NextAuth, { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        await connectDB();

        if (!credentials?.email || !credentials?.password) {
          throw new Error("Не указан email или пароль");
        }

        // Поиск пользователя по email
        const user = await User.findOne({ email: credentials.email });
        if (!user) {
          throw new Error("Пользователь не найден");
        }

        // Проверка пароля
        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("Неверный пароль");
        }

        // Возвращаем данные пользователя (в том числе id)
        return {
          id: user._id.toString(),
          email: user.email,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt", // сессия хранится в JWT
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    /**
     * Callback вызывается при создании/обновлении JWT.
     * Сохраняем user.id внутрь токена.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
      }
      return token;
    },
    /**
     * Callback вызывается при формировании session.
     * Копируем id из токена в session.user.id.
     */
    async session({ session, token }) {
      if (token?.id) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
