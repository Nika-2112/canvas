import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: "admin" | "editor" | "guest";  // ← тут
      isActive: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: "admin" | "editor" | "guest";    // ← и тут
    isActive: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: "admin" | "editor" | "guest";    // ← и тут
    isActive: boolean;
  }
}
