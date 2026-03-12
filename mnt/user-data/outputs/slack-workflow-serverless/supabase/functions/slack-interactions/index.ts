import {
  verifySlackRequest,
  postMessage,
  openModal,
  publishHome,
  getToday,
  getCurrentTime,
  formatDate,
  userLogSummaryBlocks,
} from "../_shared/slack.ts";
import {
  getLog,
  getAllLogsForDate,
  setTasks,
  completeTasks,
  checkIn,
  checkOut,
  getConfig,
} from "../_shared/database.ts";
import {
  taskPlanningModal,
  taskCompletionModal,
  managerReportModal,
} from "../_shared/modals.ts";
import { buildHomeTab } from "../_shared/home.ts";

// ──────────────────────────────────────────
// Edge Function: POST /slack-interactions
// Slack sends modal submissions & button
// clicks here via the Interactivity URL
// ──────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();

  // Verify request
  const valid = await verifySlackRequest(req, body);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Parse the payload (Slack sends it URL-encoded with a "payload" field)
  const params = new URLSearchParams(body);
  const payload = JSON.parse(params.get("payload") ?? "{}");

  const type = payload.type;
  const userId = payload.user?.id ?? "";
  const today = getToday();
  const time = getCurrentTime();
  const reportChannel = await getConfig("manager_report_channel");

  try {
    // ════════════════════════════════════════
    // VIEW SUBMISSIONS (Modal forms)
    // ════════════════════════════════════════
    if (type === "view_submission") {
      const callbackId = payload.view?.callback_id;
      const values = payload.view?.state?.values ?? {};

      // ──── Task Planning ────
      if (callbackId === "task_planning_submit") {
        const preCapRaw = values.pre_cap_block?.pre_cap_input?.value ?? "";
        const postCapRaw = values.post_cap_block?.post_cap_input?.value ?? "";

        const preCapTasks = preCapRaw.split("\n").map((s: string) => s.trim()).filter(Boolean);
        const postCapTasks = postCapRaw.split("\n").map((s: string) => s.trim()).filter(Boolean);

        await setTasks(userId, today, preCapTasks, postCapTasks);

        // DM the user confirmation
        postMessage(
          userId,
          `📋 Your tasks for today have been saved!\n\n*Pre-CAP:* ${preCapTasks.length} tasks\n*Post-CAP:* ${postCapTasks.length} tasks\n\nUse \`/complete\` at the end of the day to mark what you finished.`
        );

        // Refresh home tab
        publishHome(userId, await buildHomeTab(userId));

        // Return empty 200 to close modal
        return new Response("", { status: 200 });
      }

      // ──── Task Completion ────
      if (callbackId === "task_completion_submit") {
        const metadata = JSON.parse(payload.view?.private_metadata ?? "{}");
        const allTasks: string[] = metadata.allTasks ?? [];

        // Get checked tasks
        const checkedValues =
          values.completed_tasks_block?.completed_tasks_input?.selected_options ?? [];
        const completedFromPlan = checkedValues.map(
          // deno-lint-ignore no-explicit-any
          (opt: any) => {
            const idx = parseInt(opt.value.replace("task_", ""), 10);
            return allTasks[idx] || opt.text.text;
          }
        );

        // Get additional tasks
        const additionalRaw =
          values.additional_completed_block?.additional_completed_input?.value ?? "";
        const additionalTasks = additionalRaw
          .split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean);

        const allCompleted = [...completedFromPlan, ...additionalTasks];
        const comments = values.comments_block?.comments_input?.value ?? "";

        await completeTasks(userId, today, allCompleted, comments);

        postMessage(
          userId,
          `✅ Great work! You completed *${allCompleted.length}* tasks today.\n\nDon't forget to \`/checkout\` when you're done!`
        );

        publishHome(userId, await buildHomeTab(userId));

        return new Response("", { status: 200 });
      }

      // ──── Manager Report ────
      if (callbackId === "manager_report_submit") {
        const reportDate =
          values.report_date_block?.report_date_input?.selected_date ?? today;

        const logs = await getAllLogsForDate(reportDate);

        if (logs.length === 0) {
          postMessage(
            userId,
            `📊 *Team Report for ${formatDate(reportDate)}*\n\n_No activity recorded for this date._`
          );
          return new Response("", { status: 200 });
        }

        // Summary stats
        const checkedIn = logs.length;
        const checkedOutCount = logs.filter(
          // deno-lint-ignore no-explicit-any
          (l: any) => l.status === "checked_out"
        ).length;
        const withTasks = logs.filter(
          // deno-lint-ignore no-explicit-any
          (l: any) =>
            (l.pre_cap_tasks ?? []).length > 0 ||
            (l.post_cap_tasks ?? []).length > 0
        ).length;
        const completedCount = logs.filter(
          // deno-lint-ignore no-explicit-any
          (l: any) => (l.completed_tasks ?? []).length > 0
        ).length;

        // deno-lint-ignore no-explicit-any
        const blocks: any[] = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `📊 Team Report — ${formatDate(reportDate)}`,
            },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*👥 Checked In:* ${checkedIn}` },
              { type: "mrkdwn", text: `*⚪ Checked Out:* ${checkedOutCount}` },
              { type: "mrkdwn", text: `*📋 Tasks Planned:* ${withTasks}` },
              { type: "mrkdwn", text: `*✅ Tasks Completed:* ${completedCount}` },
            ],
          },
          { type: "divider" },
        ];

        // Individual logs
        // deno-lint-ignore no-explicit-any
        for (const log of logs as any[]) {
          blocks.push(...userLogSummaryBlocks(log));
        }

        // DM to manager
        postMessage(userId, `Team Report for ${formatDate(reportDate)}`, blocks);

        // Also to manager channel
        postMessage(
          reportChannel,
          `Team Report for ${formatDate(reportDate)}`,
          blocks
        );

        return new Response("", { status: 200 });
      }
    }

    // ════════════════════════════════════════
    // BLOCK ACTIONS (Home Tab buttons)
    // ════════════════════════════════════════
    if (type === "block_actions") {
      const action = payload.actions?.[0];
      const actionId = action?.action_id ?? "";
      const triggerId = payload.trigger_id;

      switch (actionId) {
        case "home_check_in": {
          await checkIn(userId, today, time);
          postMessage(
            reportChannel,
            `☀️ <@${userId}> checked in at *${time}*`
          );
          publishHome(userId, await buildHomeTab(userId));
          break;
        }

        case "home_plan_tasks": {
          const existing = await getLog(userId, today);
          await openModal(triggerId, taskPlanningModal(existing));
          break;
        }

        case "home_complete_tasks": {
          const existing = await getLog(userId, today);
          if (existing) {
            await openModal(triggerId, taskCompletionModal(existing));
          }
          break;
        }

        case "home_check_out": {
          await checkOut(userId, today, time);
          const updatedLog = await getLog(userId, today);
          const summaryBlocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `🌙 <@${userId}> checked out at *${time}*`,
              },
            },
            ...userLogSummaryBlocks(updatedLog, false),
          ];
          postMessage(
            reportChannel,
            `🌙 <@${userId}> checked out at ${time}`,
            summaryBlocks
          );
          publishHome(userId, await buildHomeTab(userId));
          break;
        }

        case "home_manager_report": {
          await openModal(triggerId, managerReportModal());
          break;
        }
      }

      return new Response("", { status: 200 });
    }

    return new Response("", { status: 200 });
  } catch (err) {
    console.error("Interaction error:", err);
    return new Response("", { status: 200 });
  }
});
