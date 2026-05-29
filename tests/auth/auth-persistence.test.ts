import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { accounts, appUsers, importBatches, statementTallies, transactions, userSessions } from "@/db/schema";
import {
  createSession,
  createUser,
  findUserByEmail,
  getUserBySessionToken,
  hashPassword,
  verifyPassword
} from "@/modules/auth/persistence";

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describeDb("auth persistence", () => {
  const client = postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.delete(userSessions);
    await db.delete(appUsers);
    await db.delete(statementTallies);
    await db.delete(transactions);
    await db.delete(importBatches);
    await db.delete(accounts);
  });

  afterAll(async () => {
    await client.end();
  });

  test("hashes passwords without storing the plaintext", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  test("creates users and resolves active sessions", async () => {
    const user = await createUser(db, {
      email: "admin@example.com",
      password: "correct horse battery staple",
      displayName: "Admin User",
      role: "admin"
    });
    const foundUser = await findUserByEmail(db, "ADMIN@example.com");
    const session = await createSession(db, { userId: user.id });
    const sessionUser = await getUserBySessionToken(db, session.token);

    expect(foundUser?.id).toBe(user.id);
    expect(user.passwordHash).not.toContain("correct horse battery staple");
    expect(sessionUser).toMatchObject({
      id: user.id,
      email: "admin@example.com",
      role: "admin",
      active: true
    });
  });
});
