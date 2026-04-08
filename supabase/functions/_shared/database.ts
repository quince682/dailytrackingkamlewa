import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

// ──────────────────────────────────────────
// Sync Slack Users into Supabase
// ──────────────────────────────────────────
export async function syncSlackUsers() {
  const sb = getSupabase();
  const token = Deno.env.get("SLACK_BOT_TOKEN");

  if (!token) {
    throw new Error("Missing SLACK_BOT_TOKEN env variable");
  }

  let cursor: string | undefined;
  let total = 0;
  let updated = 0;
  let created = 0;

  do {
    const url = new URL("https://slack.com/api/users.list");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error ${response.status}: ${response.statusText}`);
    }

    const slackData = await response.json();
    if (!slackData.ok) {
      throw new Error(`Failed to fetch Slack users: ${slackData.error || "unknown"}`);
    }

    for (const member of slackData.members ?? []) {
      if (!member || !member.id) continue;
      if (member.deleted) continue;
      if (member.is_bot) continue;

      const result = await upsertSlackUser(member);
      total += 1;
      if (result.updated) updated += 1;
      else created += 1;
    }

    cursor = slackData.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return { total, created, updated };
}

async function upsertSlackUser(member: any) {
  const sb = getSupabase();
  const profile = member.profile ?? {};
  const username = profile.display_name || member.name || "";
  const fullName = profile.real_name || "";
  const email = profile.email || "";

  const payload = {
    user_id: member.id,
    username,
    full_name: fullName,
    email,
  };

  const { data, error } = await sb
    .from("slack_users")
    .upsert(payload, { onConflict: "user_id" })
    .select("user_id");

  if (error) {
    console.error("Failed upserting slack user", member.id, error);
    return { updated: false, error };
  }

  return { updated: true, data };
}

export async function upsertSlackUserFromSlackId(userId: string) {
  const token = Deno.env.get("SLACK_BOT_TOKEN");
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN env variable.");

  const url = new URL("https://slack.com/api/users.info");
  url.searchParams.set("user", userId);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    throw new Error(`Slack users.info HTTP error ${response.status}: ${response.statusText}`);
  }

  const slackData = await response.json();
  if (!slackData.ok || !slackData.user) {
    throw new Error(`Failed to fetch Slack user info: ${slackData.error || "unknown"}`);
  }

  const user = slackData.user;
  if (user.deleted || user.is_bot) {
    return { ok: true, skipped: true }; // ignore bots/deleted users
  }

  const result = await upsertSlackUser(user);
  return { ok: true, ...result };
}



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
export async function getSlackUser(userId: string) {
  const sb = getSupabase();
  const { data } = await sb
    .from("slack_users")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function getAllSlackUsers() {
  const sb = getSupabase();
  const { data } = await sb
    .from("slack_users")
    .select("*")
    .order("full_name", { ascending: true });
  return data ?? [];
}

export async function getUserDisplayName(userId: string): Promise<string> {
  const user = await getSlackUser(userId);
  if (!user) return userId;
  return user.full_name || user.username || userId;
}

export async function getLog(userId: string, date: string) {
  const sb = getSupabase();
  const { data: log } = await sb
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  
  if (!log) return null;
  
  return enrichLogWithUser(userId, log);
}

export async function getLatestLog(userId: string) {
  const sb = getSupabase();
  const { data: log } = await sb
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return null;
  return enrichLogWithUser(userId, log);
}

export async function getRecentLogs(userId: string, limit = 5) {
  const sb = getSupabase();
  const { data: logs } = await sb
    .from("daily_logs")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(limit);

  if (!logs) return [];
  return await Promise.all(logs.map(async (log: any) => enrichLogWithUser(userId, log)));
}

async function enrichLogWithUser(userId: string, log: any) {
  const user = await getSlackUser(userId);
  return {
    ...log,
    username: user?.username,
    full_name: user?.full_name,
    email: user?.email,
    display_name: user?.full_name || user?.username || userId,
  };
}

export async function getAllLogsForDate(date: string) {
  const sb = getSupabase();
  const { data: logs } = await sb
    .from("daily_logs")
    .select("*")
    .eq("date", date)
    .order("check_in_time", { ascending: true });
  
  if (!logs) return [];
  
  // Enrich each log with user display names
  const enriched = await Promise.all(
    logs.map(async (log: any) => {
      const user = await getSlackUser(log.user_id);
      return {
        ...log,
        username: user?.username,
        full_name: user?.full_name,
        email: user?.email,
        display_name: user?.full_name || user?.username || log.user_id,
      };
    })
  );
  
  return enriched;
}

export async function getLogsByRange(
  startDate: string,
  endDate: string,
  userId?: string
) {
  const sb = getSupabase();
  let query = sb
    .from("daily_logs")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true })
    .order("user_id", { ascending: true });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data: logs } = await query;
  if (!logs) return [];
  
  // Enrich each log with user display names
  const enriched = await Promise.all(
    logs.map(async (log: any) => {
      const user = await getSlackUser(log.user_id);
      return {
        ...log,
        username: user?.username,
        full_name: user?.full_name,
        email: user?.email,
        display_name: user?.full_name || user?.username || log.user_id,
      };
    })
  );
  
  return enriched;
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
