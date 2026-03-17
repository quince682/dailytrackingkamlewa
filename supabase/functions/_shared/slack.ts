import { encode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

// ──────────────────────────────────────────
// Slack Request Verification
// ──────────────────────────────────────────
export async function verifySlackRequest(
  req: Request,
  body: string
): Promise<boolean> {
  const signingSecret = Deno.env.get("SLACK_SIGNING_SECRET")!;
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const slackSig = req.headers.get("x-slack-signature") ?? "";

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(sigBasestring)
  );
  const mySignature = `v0=${new TextDecoder().decode(encode(new Uint8Array(sig)))}`;
  return mySignature === slackSig;
}

// ──────────────────────────────────────────
// Slack API Calls
// ──────────────────────────────────────────
const SLACK_API = "https://slack.com/api";

function botToken(): string {
  return Deno.env.get("SLACK_BOT_TOKEN")!;
}

async function slackPost(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken()}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function postMessage(
  channel: string,
  text: string,
  blocks?: unknown[]
) {
  return slackPost("chat.postMessage", { channel, text, blocks });
}

export async function postEphemeral(
  channel: string,
  user: string,
  text: string,
  blocks?: unknown[]
) {
  return slackPost("chat.postEphemeral", { channel, user, text, blocks });
}

export async function openModal(triggerId: string, view: unknown) {
  return slackPost("views.open", { trigger_id: triggerId, view });
}

export async function publishHome(userId: string, view: unknown) {
  return slackPost("views.publish", { user_id: userId, view });
}

export async function respond(responseUrl: string, payload: Record<string, unknown>) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function uploadFile(
  channel: string,
  filename: string,
  content: string,
  initialComment?: string
) {
  const form = new FormData();
  form.append("channels", channel);
  form.append("filename", filename);
  form.append("file", new Blob([content], { type: "text/csv" }), filename);
  if (initialComment) form.append("initial_comment", initialComment);

  const res = await fetch(`${SLACK_API}/files.upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken()}`,
    },
    body: form,
  });

  return res.json();
}

// ──────────────────────────────────────────
// Time helpers
// ──────────────────────────────────────────
export function getToday(tz = "Africa/Douala"): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
}

export function getCurrentTime(tz = "Africa/Douala"): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ──────────────────────────────────────────
// Status formatting
// ──────────────────────────────────────────
const STATUS_EMOJI: Record<string, string> = {
  checked_in: "🟡",
  tasks_set: "🔵",
  completed: "🟢",
  checked_out: "⚪",
};

const STATUS_LABEL: Record<string, string> = {
  checked_in: "Checked In",
  tasks_set: "Tasks Planned",
  completed: "Tasks Completed",
  checked_out: "Checked Out",
};

function taskListBlock(title: string, tasks: string[], emoji = "•"): string {
  if (!tasks || tasks.length === 0) return `*${title}:* _None set_`;
  const items = tasks.map((t: string) => `${emoji} ${t}`).join("\n");
  return `*${title}:*\n${items}`;
}

// deno-lint-ignore no-explicit-any
export function userLogSummaryBlocks(log: any, includeHeader = true): unknown[] {
  const blocks: unknown[] = [];

  if (includeHeader) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${STATUS_EMOJI[log.status] || "⚪"} *<@${log.user_id}>* — ${STATUS_LABEL[log.status] || log.status}`,
      },
    });
  }

  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Check-in:* ${log.check_in_time || "—"}` },
      { type: "mrkdwn", text: `*Check-out:* ${log.check_out_time || "—"}` },
    ],
  });

  const preCap = log.pre_cap_tasks ?? [];
  const postCap = log.post_cap_tasks ?? [];
  const completed = log.completed_tasks ?? [];

  if (preCap.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: taskListBlock("Pre-CAP Tasks", preCap, "📋") },
    });
  }

  if (postCap.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: taskListBlock("Post-CAP Tasks", postCap, "📋") },
    });
  }

  if (completed.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: taskListBlock("Completed", completed, "✅") },
    });
  }

  if (log.completion_comments) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Comments:* ${log.completion_comments}` },
    });
  }

  blocks.push({ type: "divider" });
  return blocks;
}
