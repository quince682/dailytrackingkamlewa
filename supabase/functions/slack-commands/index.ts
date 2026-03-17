import { serve } from "./deps.ts";
import { getToday, getCurrentTime } from "../_shared/slack.ts";
import { getLog, checkIn } from "../_shared/database.ts";
import { preCapModal, postCapModal } from "../_shared/modals.ts";

declare const Deno: any;

serve(async (req: Request) => {
  const payload = await req.formData();
  const command = payload.get("command")?.toString();
  const userId = payload.get("user_id")?.toString() || "";
  const triggerId = payload.get("trigger_id")?.toString() || "";

  const today = getToday();

  // Helper to send JSON back to Slack
  const respond = (body: any) =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });

  // Helper to open a modal asynchronously (with a timeout guard)
  const openModal = async (view: any) => {
    const res = await fetch("https://slack.com/api/views.open", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SLACK_BOT_TOKEN")}`,
      },
      body: JSON.stringify({
        trigger_id: triggerId,
        view,
      }),
    });

    const json = await res.json();
    console.log("views.open response:", json);
    return json;
  };

  const openModalWithTimeout = async (view: any, ms = 2000) => {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("openModal timeout")), ms)
    );

    return Promise.race([openModal(view), timeout]);
  };

  switch (command) {
    case "/checkin": {
      try {
        await checkIn(userId, today, getCurrentTime());
        await openModalWithTimeout(preCapModal(await getLog(userId, today)), 2000);
        return new Response("", { status: 200 });
      } catch (err) {
        console.error("Error opening check-in modal:", err);
        return respond({
          response_type: "ephemeral",
          text: "⚠️ Could not open the check-in modal right now. Please try again.",
        });
      }
    }

    case "/tasks": {
      const log = await getLog(userId, today);
      const tasks = (log?.pre_cap_tasks ?? []) as string[];
      const text = tasks.length
        ? `*Your Pre-CAP tasks (today)*\n• ${tasks.join("\n• ")}`
        : "You don’t have any Pre-CAP tasks yet. Use /checkin to add them.";

      return respond({ response_type: "ephemeral", text });
    }

    case "/checkout":
    case "/complete": {
      try {
        const existingLog = await getLog(userId, today);
        if (!existingLog) {
          return respond({
            response_type: "ephemeral",
            text: "⚠️ You need to check in first (use /checkin) before checking out.",
          });
        }

        await openModalWithTimeout(postCapModal(existingLog), 2000);
        return respond({
          response_type: "ephemeral",
          text: "Checkout modal opened.",
        });
      } catch (err) {
        console.error("Failed to open checkout modal:", err);
        return respond({
          response_type: "ephemeral",
          text: "⚠️ Could not open the checkout modal right now. Please try again.",
        });
      }
    }

    default:
      return respond({
        response_type: "ephemeral",
        text: "Command not recognized.",
      });
  }
});
