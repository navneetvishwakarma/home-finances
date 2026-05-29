import { expect, test, vi } from "vitest";

const getAll = vi.fn(() => []);
const createServerSupabaseClient = vi.fn(async () => {
  throw new Error("Supabase should not be called without an auth cookie");
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll
  }))
}));

vi.mock("@/modules/auth/supabase", () => ({
  createServerSupabaseClient
}));

test("getCurrentUser returns null without calling Supabase when no auth cookie exists", async () => {
  const { getCurrentUser } = await import("@/modules/auth/session");

  await expect(getCurrentUser()).resolves.toBeNull();
  expect(createServerSupabaseClient).not.toHaveBeenCalled();
});
