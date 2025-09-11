/**
 * API-эндпоинт регистрации пользователя.
 * Принимает: { email, password } в теле запроса (JSON).
 * Серверная логика:
 *  - нормализация/проверка email и пароля;
 *  - проверка уникальности email;
 *  - хэширование пароля через bcrypt;
 *  - создание пользователя в MongoDB;
 *  - возврат публичных данных пользователя (без passwordHash).
 */

import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { connectDB } from "@/lib/mongodb";
import { User } from "@/models/User";

export async function POST(req: Request) {
  try {
    await connectDB();
    const { email, password } = await req.json();

    const trimmedEmail = (email || "").trim();
    const trimmedPassword = (password || "").trim();

    // Базовая серверная валидация (обязательна, т.к. клиентскую можно обойти).
    if (!trimmedEmail || !trimmedPassword) {
      return NextResponse.json({ error: "Email и пароль обязательны." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: "Некорректный формат email." }, { status: 400 });
    }
    if (trimmedPassword.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен содержать не менее 6 символов." },
        { status: 400 }
      );
    }

    // Проверка уникальности email.
    const existingUser = await User.findOne({ email: trimmedEmail });
    if (existingUser) {
      return NextResponse.json({ error: "Такой пользователь уже зарегистрирован." }, { status: 400 });
    }

    // Хэширование пароля (bcrypt).
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(trimmedPassword, saltRounds);

    // Создание пользователя.
    const user = await User.create({ email: trimmedEmail, passwordHash });

    // Возвращаем публичные данные (без passwordHash).
    return NextResponse.json({
      _id: user._id,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Внутренняя ошибка сервера" }, { status: 500 });
  }
}
