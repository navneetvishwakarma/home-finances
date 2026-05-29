import { cookies } from "next/headers";
import { getMigratedDatabase } from "@/db/client";
import {
  deleteSession,
  ensureBootstrapAdmin,
  getUserBySessionToken
} from "@/modules/auth/persistence";

export const sessionCookieName = "finstate_session";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const db = await getMigratedDatabase();
  await ensureBootstrapAdmin(db);

  return getUserBySessionToken(db, token);
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

export async function clearCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;

  if (token) {
    const db = await getMigratedDatabase();
    await deleteSession(db, token);
  }

  cookieStore.delete(sessionCookieName);
}
