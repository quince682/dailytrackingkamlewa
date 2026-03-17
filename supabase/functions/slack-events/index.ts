// supabase/functions/slack-events/index.ts

import { verifySlackRequest, publishHome } from "../_shared/slack.ts";
import { buildHomeTab } from "../_shared/home.ts";

// ──────────────────────────────────────────
// Edge Function: POST /slack-events
// Handles Slack Events API (app_home_opened)
// and the initial URL verification challenge
// ──────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  let payload;

  try {
    payload = JSON.parse(body);
  } catch (err) {
    console.error("Invalid JSON:", err);
    return new Response("Bad Request", { status: 400 });
  }

  // ──── Handle URL Verification Challenge ────
  // Slack sends this when you first set the Events URL
  if (payload.type === "url_verification") {
    return new Response(payload.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // ──── Verify Slack Request Signature ────
  const valid = await verifySlackRequest(req, body);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const event = payload.event;

    // ──── Handle app_home_opened ────
    if (event?.type === "app_home_opened" && event?.tab === "home") {
      const userId = event.user;
      const homeView = await buildHomeTab(userId);
      await publishHome(userId, homeView);
    }

    return new Response("", { status: 200 });
  } catch (err) {
    console.error("Event error:", err);
    return new Response("", { status: 200 });
  }
});
