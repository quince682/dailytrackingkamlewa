import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { getAllSlackUsers, getLogsByRange } from "../_shared/database.ts";
import { getToday } from "../_shared/slack.ts";

declare const Deno: any;

serve(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "users") {
      const users = await getAllSlackUsers();
      return new Response(JSON.stringify({ ok: true, users }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "today") {
      const today = getToday();
      const logs = await getLogsByRange(today, today);
      return new Response(JSON.stringify({ ok: true, date: today, logs }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});