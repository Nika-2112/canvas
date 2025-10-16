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
        login: { label: "Логин или email", type: "text" },
        username: { label: "Логин", type: "text" },
        email: { label: "Email", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        await connectDB();

        const rawLogin = String(
          (credentials?.login ?? credentials?.username ?? credentials?.email ?? "")
        ).trim();
        const password = String(credentials?.password ?? "");

        if (!rawLogin || !password) {
          throw new Error("Не указан логин/email или пароль");
        }

        const user = await User.findOne({
          $or: [{ username: rawLogin }, { email: rawLogin }],
        });

        if (!user) throw new Error("Пользователь не найден");
       

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) throw new Error("Неверный пароль");

          return {
            id: user._id.toString(),
            name: user.username || user.email || "Пользователь",
            email: user.email || null,
            role: (user.role as "admin" | "editor" | "guest") ?? "editor",
            username: user.username || null,
            isActive: user.isActive !== false,
          } as any;

      },
    }),
  ],

  session: { strategy: "jwt" },
  pages: { signIn: "/login" },

  callbacks: {
    async jwt({ token, user }) {
      await connectDB();

      if (user) {
        token.id = (user as any).id;
        token.role = ((user as any).role as "admin" | "editor") ?? "editor";
        token.username = (user as any).username ?? null;
        token.isActive = (user as any).isActive ?? true;
        token.email = (user as any).email ?? token.email;
      }

      if (token?.id) {
        try {
          const fresh = await User.findById(token.id)
            .select("role username email isActive")
            .lean<{
              role?: "admin" | "editor";
              username?: string;
              email?: string | null;
              isActive?: boolean;
            }>();

          if (fresh) {
            token.role = (fresh.role as "admin" | "editor") ?? (token.role as any) ?? "editor";
            token.username = fresh.username ?? token.username;
            token.email = (fresh.email ?? token.email) as any;
            token.isActive = fresh.isActive !== false;
          } else {
            token.isActive = false;
          }
        } catch {
          // оставляем прежние значения
        }
      }

      return token;
    },

    async session({ session, token }) {
      (session.user as any) = {
        id: (token as any).id,
        username: (token as any).username ?? null,
        role: ((token as any).role as "admin" | "editor") ?? "editor",
        isActive: (token as any).isActive ?? true,
        email: (token as any).email ?? session.user?.email ?? null,
        name:
          session.user?.name ??
          (token as any).username ??
          (token as any).email ??
          "Пользователь",
      };
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      try {
        await connectDB();
        if ((user as any)?.id) {
          await User.findByIdAndUpdate((user as any).id, { $set: { isActive: true } });
        }
      } catch {}
    },
    async signOut({ token }) {
      try {
        await connectDB();
        if ((token as any)?.id) {
          await User.findByIdAndUpdate((token as any).id, { $set: { isActive: false } });
        }
      } catch {}
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
