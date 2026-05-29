import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { appUsers, userSessions } from "@/db/schema";

type Db = PostgresJsDatabase<Record<string, unknown>>;

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, key] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !key) {
    return false;
  }

  const expected = Buffer.from(key, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createUser(
  db: Db,
  input: {
    email: string;
    password: string;
    displayName: string;
    role?: "admin" | "user";
  }
) {
  const email = normalizeEmail(input.email);
  const [user] = await db
    .insert(appUsers)
    .values({
      id: randomUUID(),
      email,
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
      role: input.role ?? "user",
      active: true
    })
    .returning();

  return user;
}

export async function findUserByEmail(db: Db, email: string) {
  const [user] = await db
    .select()
    .from(appUsers)
    .where(eq(appUsers.email, normalizeEmail(email)))
    .limit(1);

  return user ?? null;
}

export async function createSession(db: Db, input: { userId: string }) {
  const token = randomBytes(32).toString("base64url");
  const [session] = await db
    .insert(userSessions)
    .values({
      id: randomUUID(),
      userId: input.userId,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)
    })
    .returning();

  return { ...session, token };
}

export async function getUserBySessionToken(db: Db, token: string) {
  const [row] = await db
    .select({ user: appUsers })
    .from(userSessions)
    .innerJoin(appUsers, eq(userSessions.userId, appUsers.id))
    .where(
      and(
        eq(userSessions.tokenHash, hashSessionToken(token)),
        gt(userSessions.expiresAt, new Date()),
        eq(appUsers.active, true)
      )
    )
    .limit(1);

  return row?.user ?? null;
}

export async function deleteSession(db: Db, token: string) {
  await db.delete(userSessions).where(eq(userSessions.tokenHash, hashSessionToken(token)));
}

export async function ensureBootstrapAdmin(db: Db) {
  const email = process.env.APP_ADMIN_EMAIL;
  const password = process.env.APP_ADMIN_PASSWORD;

  if (!email || !password) {
    return null;
  }

  const existingUser = await findUserByEmail(db, email);

  if (existingUser) {
    return existingUser;
  }

  return createUser(db, {
    email,
    password,
    displayName: process.env.APP_ADMIN_NAME ?? "Admin",
    role: "admin"
  });
}

export async function hasAnyUsers(db: Db) {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(appUsers);
  return row.count > 0;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
