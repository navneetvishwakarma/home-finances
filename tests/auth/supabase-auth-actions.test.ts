import { beforeEach, expect, test, vi } from "vitest";

const signInWithPassword = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect
}));

vi.mock("@/db/client", () => ({
  getMigratedDatabase: vi.fn(async () => {
    throw new Error("legacy database auth should not be called");
  })
}));

vi.mock("@/modules/auth/supabase", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signUp,
      signOut
    }
  }))
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  signUp.mockReset();
  signOut.mockReset();
  redirect.mockClear();
});

test("loginAction signs in with Supabase Auth", async () => {
  signInWithPassword.mockResolvedValueOnce({ error: null });
  const { loginAction } = await import("@/app/actions");

  await expect(
    loginAction(formData({ email: "USER@example.com", password: "correct horse battery staple" }))
  ).rejects.toThrow("REDIRECT:/?success=Signed%20in");

  expect(signInWithPassword).toHaveBeenCalledWith({
    email: "user@example.com",
    password: "correct horse battery staple"
  });
});

test("logoutAction signs out with Supabase Auth and redirects with success", async () => {
  signOut.mockResolvedValueOnce({ error: null });
  const { logoutAction } = await import("@/app/actions");

  await expect(logoutAction()).rejects.toThrow("REDIRECT:/?success=Signed%20out");
  expect(signOut).toHaveBeenCalled();
});

test("signupAction creates the first-time Supabase Auth user", async () => {
  signUp.mockResolvedValueOnce({ error: null });
  const { signupAction } = await import("@/app/actions");

  await expect(
    signupAction(
      formData({
        displayName: "First User",
        email: "first@example.com",
        password: "correct horse battery staple"
      })
    )
  ).rejects.toThrow("REDIRECT:/?success=Account%20created.%20Check%20your%20email%20if%20confirmation%20is%20enabled.");

  expect(signUp).toHaveBeenCalledWith({
    email: "first@example.com",
    password: "correct horse battery staple",
    options: {
      data: {
        display_name: "First User"
      }
    }
  });
});

function formData(values: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}
