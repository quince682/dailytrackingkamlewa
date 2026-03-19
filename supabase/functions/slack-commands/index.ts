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
  const channelId = payload.get("channel_id")?.toString() || "";

  const today = getToday();

  // Helper to send JSON back to Slack
  const respond = (body: any) =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });

  // Helper to send ephemeral messages to a user
  const postMessage = async (user: string, text: string) => {
    const res = await fetch("https://slack.com/api/chat.postEphemeral", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SLACK_BOT_TOKEN")}`,
      },
      body: JSON.stringify({
        channel: channelId,
        user,
        text,
      }),
    });
    const json = await res.json();
    console.log("chat.postEphemeral response:", json);
    return json;
  };

  // Helper to open a modal asynchronously
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

  switch (command) {
    case "/checkin": {
      try {
        await checkIn(userId, today, getCurrentTime());
        const log = await getLog(userId, today);
        const res = await openModal(preCapModal(log));
        if (!res.ok) {
          return respond({ response_type: "ephemeral", text: `⚠️ Could not open check-in modal: ${res.error}` });
        }
        return new Response("", { status: 200 });
      } catch (err) {
        console.error("Error in /checkin:", err);
        return respond({ response_type: "ephemeral", text: "⚠️ Could not open the check-in modal right now. Please try again." });
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

    case "/checkout": {
      try {
        const existingLog = await getLog(userId, today);
        if (!existingLog) {
          return respond({ response_type: "ephemeral", text: "⚠️ You need to check in first (use /checkin) before checking out." });
        }

        const modalPayload = postCapModal(existingLog);
        const res = await openModal(modalPayload);
        if (!res.ok) {
          return respond({ response_type: "ephemeral", text: `⚠️ Could not open the checkout modal: ${res.error}` });
        }
        return new Response("", { status: 200 });
      } catch (err) {
        console.error("Error in /checkout:", err);
        return respond({ response_type: "ephemeral", text: "⚠️ Could not open the checkout modal right now. Please try again." });
      }
    }

    default:
      return respond({
        response_type: "ephemeral",
        text: "Command not recognized.",
      });
  }
});
