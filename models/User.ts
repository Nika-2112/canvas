// models/User.ts
import mongoose, { Schema, model, models } from "mongoose";

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: false, unique: false, sparse: true, trim: true },
    passwordHash: { type: String, required: true },

    role: {
      type: String,
      enum: ["admin", "editor", "guest"],  // guest точно в enum
      default: "editor",
    },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// один админ на всю коллекцию (partial unique)
UserSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "admin" } });

// 👇 ДОБАВЬТЕ ЭТО: в dev удаляем старую модель, чтобы подхватилась новая схема
if (process.env.NODE_ENV !== "production" && mongoose.models.User) {
  delete mongoose.models.User;
}

export const User = models.User || model("User", UserSchema);
