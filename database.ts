import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ──────────────────────────────────────────
// Supabase Client (reused across functions)
// ──────────────────────────────────────────
export function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ──────────────────────────────────────────
// Config helpers
// ──────────────────────────────────────────
export async function getConfig(key: string): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb
    .from("workspace_config")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value ?? "";
}

export async function getManagerIds(): Promise<string[]> {
  const raw = await getConfig("manager_user_ids");
  return raw.split(",").map((s: string) => s.trim()).filter(Boolean);
}

export async function isManager(userId: string): Promise<boolean> {
  const managers = await getManagerIds();
  return managers.includes(userId);
}

// ──────────────────────────────────────────
// Database operations
// ──────────────────────────────────────────
export async function getLog(userId: string, date: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  return data;
}

export async function getAllLogsForDate(date: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from("daily_logs")
    .select("*")
    .eq("date", date)
    .order("check_in_time", { ascending: true });
  return data ?? [];
}

export async function checkIn(userId: string, date: string, time: string) {
  const sb = getSupabase();
  const { data } = await sb.rpc("check_in", {
    p_user_id: userId,
    p_date: date,
    p_time: time,
  });
  return data;
}

export async function setTasks(
  userId: string,
  date: string,
  preCap: string[],
  postCap: string[]
) {
  const sb = getSupabase();
  const { data } = await sb.rpc("set_tasks", {
    p_user_id: userId,
    p_date: date,
    p_pre_cap: preCap,
    p_post_cap: postCap,
  });
  return data;
}

export async function completeTasks(
  userId: string,
  date: string,
  completed: string[],
  comments: string
) {
  const sb = getSupabase();
  const { data } = await sb.rpc("complete_tasks", {
    p_user_id: userId,
    p_date: date,
    p_completed: completed,
    p_comments: comments,
  });
  return data;
}

export async function checkOut(userId: string, date: string, time: string) {
  const sb = getSupabase();
  const { data } = await sb.rpc("check_out", {
    p_user_id: userId,
    p_date: date,
    p_time: time,
  });
  return data;
}
