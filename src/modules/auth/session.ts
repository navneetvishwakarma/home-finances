import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/modules/auth/supabase";

export async function getCurrentUser() {
  if (!(await hasSupabaseAuthCookie())) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) {
    return null;
  }

  return {
    id: data.user.id,
    email: data.user.email,
    displayName: displayNameForUser(data.user),
    role: String(data.user.app_metadata?.role ?? "user"),
    active: true,
    createdAt: new Date(data.user.created_at),
    updatedAt: new Date(data.user.updated_at ?? data.user.created_at)
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required");
  }

  return user;
}

function displayNameForUser(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  const metadataName = user.user_metadata?.display_name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim();
  }

  return user.email?.split("@")[0] ?? "User";
}

async function hasSupabaseAuthCookie() {
  const cookieStore = await cookies();

  return cookieStore.getAll().some((cookie) => {
    return cookie.name.startsWith("sb-") || cookie.name.includes("supabase");
  });
}
