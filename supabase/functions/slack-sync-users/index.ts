import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { syncSlackUsers } from "../_shared/database.ts";

declare const Deno: any;

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await syncSlackUsers();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("syncSlackUsers error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error?.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});