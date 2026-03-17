import {
  verifySlackRequest,
  postMessage,
  respond,
  openModal,
  getToday,
  getCurrentTime,
  userLogSummaryBlocks,
} from "../_shared/slack.ts";
import {
  getLog,
  getAllLogsForDate,
  checkIn,
  checkOut,
  isManager,
  getConfig,
} from "../_shared/database.ts";
import {
  taskPlanningModal,
  taskCompletionModal,
  managerReportModal,
} from "../_shared/modals.ts";
import { buildHomeTab } from "../_shared/home.ts";
import { publishHome } from "../_shared/slack.ts";

// ──────────────────────────────────────────
// Edge Function: POST /slack-commands
// Slack sends all slash commands here
// ──────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();

  // Verify request is from Slack
  const valid = await verifySlackRequest(req, body);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const params = new URLSearchParams(body);
  const command = params.get("command") ?? "";
  const userId = params.get("user_id") ?? "";
  const channelId = params.get("channel_id") ?? "";
  const triggerId = params.get("trigger_id") ?? "";
  const responseUrl = params.get("response_url") ?? "";

  const today = getToday();
  const time = getCurrentTime();
  const reportChannel = await getConfig("manager_report_channel");

  try {
    switch (command) {
      // ──── /checkin ────
      case "/checkin": {
        const existing = await getLog(userId, today);
        if (existing && existing.status !== "checked_out") {
          return jsonResponse({
            response_type: "ephemeral",
            text: `⚠️ You already checked in today at *${existing.check_in_time}*. Use \`/tasks\` to plan your day!`,
          });
        }

        await checkIn(userId, today, time);

        // Notify manager channel (async, don't block response)
        postMessage(reportChannel, `☀️ <@${userId}> checked in at *${time}*`);
        publishHome(userId, await buildHomeTab(userId));

        return jsonResponse({
          response_type: "in_channel",
          text: `☀️ <@${userId}> checked in at *${time}*. Good morning!`,
        });
      }

      // ──── /tasks ────
      case "/tasks": {
        const existing = await getLog(userId, today);
        if (!existing) {
          return jsonResponse({
            response_type: "ephemeral",
            text: "⚠️ Please `/checkin` first before planning your tasks.",
          });
        }

        await openModal(triggerId, taskPlanningModal(existing));
        return emptyResponse();
      }

      // ──── /complete ────
      case "/complete": {
        const existing = await getLog(userId, today);
        if (!existing) {
          return jsonResponse({
            response_type: "ephemeral",
            text: "⚠️ Please `/checkin` first before completing tasks.",
          });
        }

        await openModal(triggerId, taskCompletionModal(existing));
        return emptyResponse();
      }

      // ──── /checkout ────
      case "/checkout": {
        const existing = await getLog(userId, today);
        if (!existing) {
          return jsonResponse({
            response_type: "ephemeral",
            text: "⚠️ You haven't checked in today. Use `/checkin` first.",
          });
        }
        if (existing.status === "checked_out") {
          return jsonResponse({
            response_type: "ephemeral",
            text: `⚠️ You already checked out today at *${existing.check_out_time}*.`,
          });
        }

        await checkOut(userId, today, time);
        const updatedLog = await getLog(userId, today);

        const summaryBlocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🌙 <@${userId}> checked out at *${time}*. Here's their day summary:`,
            },
          },
          ...userLogSummaryBlocks(updatedLog, false),
        ];

        // Post to manager channel
        postMessage(
          reportChannel,
          `🌙 <@${userId}> checked out at ${time}`,
          summaryBlocks
        );
        publishHome(userId, await buildHomeTab(userId));

        return jsonResponse({
          response_type: "in_channel",
          blocks: summaryBlocks,
          text: `🌙 <@${userId}> checked out at ${time}`,
        });
      }

      // ──── /mystatus ────
      case "/mystatus": {
        const log = await getLog(userId, today);
        if (!log) {
          return jsonResponse({
            response_type: "ephemeral",
            text: "You haven't checked in today yet. Use `/checkin` to start your day!",
          });
        }
        return jsonResponse({
          response_type: "ephemeral",
          blocks: userLogSummaryBlocks(log),
          text: "Your daily status",
        });
      }

      // ──── /report ────
      case "/report": {
        const mgr = await isManager(userId);
        if (!mgr) {
          return jsonResponse({
            response_type: "ephemeral",
            text: "🔒 Only managers can access team reports.",
          });
        }
        await openModal(triggerId, managerReportModal());
        return emptyResponse();
      }

      default:
        return jsonResponse({
          response_type: "ephemeral",
          text: `Unknown command: ${command}`,
        });
    }
  } catch (err) {
    console.error("Command error:", err);
    return jsonResponse({
      response_type: "ephemeral",
      text: "❌ Something went wrong. Please try again.",
    });
  }
});

// ──────────────────────────────────────────
// Response helpers
// ──────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse() {
  return new Response("", { status: 200 });
}
