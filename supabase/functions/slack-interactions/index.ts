import {
  verifySlackRequest,
  postMessage,
  openModal,
  publishHome,
  getToday,
  getCurrentTime,
  formatDate,
  userLogSummaryBlocks,
  uploadFile,
} from "../_shared/slack.ts";

declare const Deno: any;

import {
  getLog,
  getAllLogsForDate,
  getLogsByRange,
  setTasks,
  completeTasks,
  checkIn,
  checkOut,
  getConfig,
  isManager,
} from "../_shared/database.ts";

import {
  preCapModal,
  postCapModal,
  managerReportModal,
} from "../_shared/modals.ts";

import { buildHomeTab } from "../_shared/home.ts";

function formatTasks(tasks: string[]) {
  if (!tasks || tasks.length === 0) return "_None_";
  return tasks.map((t) => `• ${t}`).join("\n");
}

function groupLogsByDate(logs: any[]) {
  const groups: Record<string, any[]> = {};
  for (const log of logs) {
    const d = log.date ?? "";
    if (!groups[d]) groups[d] = [];
    groups[d].push(log);
  }
  return groups;
}

function dateDiffInDays(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const diffMs = e.getTime() - s.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function generateCsv(logs: any[]) {
  const header = [
    "user_id",
    "date",
    "check_in_time",
    "check_out_time",
    "pre_cap_tasks",
    "completed_tasks",
    "comments",
  ];

  const rows = logs.map((log) => {
    const pre = Array.isArray(log.pre_cap_tasks) ? log.pre_cap_tasks.join(" | ") : "";
    const completed = Array.isArray(log.completed_tasks) ? log.completed_tasks.join(" | ") : "";
    const comment = log.completion_comments ?? "";

    const escape = (v: any) => String(v ?? "").replace(/"/g, '""');

    return [
      escape(log.user_id),
      escape(log.date),
      escape(log.check_in_time),
      escape(log.check_out_time),
      `"${escape(pre)}"`,
      `"${escape(completed)}"`,
      `"${escape(comment)}"`,
    ].join(",");
  });

  return [header.join(","), ...rows].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 🔥 STEP 1: Read body FAST
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);
  let payload: any = {};
  try {
    payload = JSON.parse(params.get("payload") ?? "{}");
  } catch (e) {
    console.error("Invalid payload JSON:", e);
    return new Response("Invalid payload", { status: 400 });
  }

  const type = payload.type;

  console.log("🔥 TYPE:", type);

  // 🔥 STEP 2: ACK IMMEDIATELY (CRITICAL)
  let ack: Response;

  if (type === "view_submission") {
    ack = new Response(
      JSON.stringify({ response_action: "clear" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } else {
    ack = new Response("", { status: 200 });
  }

  // 🔥 STEP 3: Process async AFTER ACK
  (async () => {
    // ✅ Verify Slack signature (disabled for debugging)
    // const valid = await verifySlackRequest(req, rawBody);
    // if (!valid) {
    //   console.error("❌ Invalid Slack signature");
    //   return;
    // }

    try {
      console.log("🔥 Processing interaction async");

      const userId = payload.user?.id ?? "";
      const today = getToday();
      const time = getCurrentTime();

      console.log("👤 USER:", userId);

      const reportChannel = await getConfig("manager_report_channel");

      // ════════════════════════════════════════
      // MODAL SUBMISSIONS
      // ════════════════════════════════════════
      if (type === "view_submission") {
        const callbackId = payload.view?.callback_id;
        const values = payload.view?.state?.values ?? {};

        console.log("📦 CALLBACK:", callbackId);

        // ─── PRE‑CAP (CHECK-IN) ───
        if (callbackId === "precap_submit") {
          const preCapTasks = [];
          for (const key in values) {
            if (key.startsWith('task_') && key !== 'add_task') {
              const value = values[key]?.task?.value;
              if (value && value.trim()) {
                preCapTasks.push(value.trim());
              }
            }
          }
          console.log("Pre-CAP tasks:", preCapTasks);

          const existingLog = await getLog(userId, today);
          console.log("Existing log:", existingLog);
          const existingPostCap = existingLog?.post_cap_tasks ?? [];

          const result = await setTasks(userId, today, preCapTasks, existingPostCap);
          console.log("setTasks result:", result);

          const taskList = preCapTasks.length
            ? preCapTasks.map((t: string) => `• ${t}`).join("\n")
            : "_No tasks set._";

          const postRes = await postMessage(
            userId,
            `✅ Check-in done! Here are your Pre‑CAP tasks for today:\n${taskList}`
          );
          console.log("postMessage (check-in) response:", postRes);

          await publishHome(userId, await buildHomeTab(userId));
        }

        // ─── POST‑CAP (CHECKOUT) ───
        if (callbackId === "postcap_submit") {
          const existingLog = await getLog(userId, today);
          const tasks = (existingLog?.pre_cap_tasks ?? []) as string[];
          const statuses: { task: string; status: string }[] = [];
          for (let i = 0; i < tasks.length; i++) {
            const status = values[`task_${i}`]?.status?.selected_option?.value || "in_progress";
            statuses.push({ task: tasks[i], status });
          }
          console.log("Task statuses:", statuses);

          const completed = statuses.filter((s) => s.status === "completed").map((s) => s.task);
          const statusMap = Object.fromEntries(statuses.map((s) => [s.task, s.status]));

          await completeTasks(userId, today, completed, JSON.stringify(statusMap));
          await checkOut(userId, today, time);

          const completedList = completed.length
            ? completed.map((t: string) => `• ${t}`).join("\n")
            : "_No completed tasks recorded._";

          const postRes = await postMessage(
            userId,
            `✅ Check-out done! Here are your completed tasks:\n${completedList}`
          );
          console.log("postMessage (check-out) response:", postRes);

          await publishHome(userId, await buildHomeTab(userId));
        }

        // ─── MANAGER REPORT ───
        if (callbackId === "manager_report_submit") {
          const manager = await isManager(userId);
          if (!manager) {
            await postMessage(userId, "🚫 You are not allowed to run this report.");
            return;
          }

          const selectedUser =
            values?.user_block?.user_select_input?.selected_user || "";

          let startDate = values?.start_date_block?.start_date_input?.selected_date;
          let endDate = values?.end_date_block?.end_date_input?.selected_date;

          const quickFilter =
            values?.quick_filter_block?.quick_filter_input?.selected_option?.value;

          if (quickFilter === "today") {
            startDate = today;
            endDate = today;
          } else if (quickFilter === "this_week") {
            const dt = new Date(today);
            const day = dt.getDay();
            const diff = (day + 6) % 7; // Monday as start
            const start = new Date(dt);
            start.setDate(dt.getDate() - diff);
            startDate = start.toISOString().split("T")[0];
            endDate = today;
          }

          if (!startDate || !endDate) {
            await postMessage(userId, "Please select a valid start and end date.");
            return;
          }

          if (startDate > endDate) {
            await postMessage(userId, "Start date must be the same or before end date.");
            return;
          }

          const logs = await getLogsByRange(startDate, endDate, selectedUser || undefined);

          if (!logs || logs.length === 0) {
            await postMessage(
              userId,
              `📊 Report ${formatDate(startDate)} – ${formatDate(endDate)}\n_No activity found._`
            );
            return;
          }

          const rangeDays = dateDiffInDays(startDate, endDate) + 1;

          if (rangeDays <= 7) {
            const blocks: any[] = [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: `📊 Report — ${formatDate(startDate)} → ${formatDate(endDate)}`,
                },
              },
              {
                type: "section",
                fields: [
                  {
                    type: "mrkdwn",
                    text: `*User:* ${selectedUser ? `<@${selectedUser}>` : "All users"}`,
                  },
                  {
                    type: "mrkdwn",
                    text: `*Range:* ${formatDate(startDate)} → ${formatDate(endDate)}`,
                  },
                ],
              },
              { type: "divider" },
            ];

            if (selectedUser) {
              const byDate = groupLogsByDate(logs);
              for (const date of Object.keys(byDate).sort()) {
                blocks.push({
                  type: "section",
                  text: { type: "mrkdwn", text: `*${formatDate(date)}*` },
                });

                for (const log of byDate[date]) {
                  blocks.push({
                    type: "section",
                    fields: [
                      { type: "mrkdwn", text: `*In:* ${log.check_in_time || "—"}` },
                      { type: "mrkdwn", text: `*Out:* ${log.check_out_time || "—"}` },
                    ],
                  });
                  blocks.push({
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Pre‑CAP:*\n${formatTasks(log.pre_cap_tasks || [])}`,
                    },
                  });
                  blocks.push({
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*Post‑CAP:*\n${formatTasks(log.completed_tasks || [])}`,
                    },
                  });

                  if (log.completion_comments) {
                    blocks.push({
                      type: "section",
                      text: {
                        type: "mrkdwn",
                        text: `*Comments:* ${log.completion_comments}`,
                      },
                    });
                  }

                  blocks.push({ type: "divider" });
                }
              }

              await postMessage(userId, "📊 Team Report", blocks);
              if (reportChannel) await postMessage(reportChannel, "📊 Team Report", blocks);
              return;
            }

            // All users summary
            const checkedIn = logs.length;
            const checkedOut = logs.filter((l: any) => l.status === "checked_out").length;
            const completed = logs.filter((l: any) => (l.completed_tasks ?? []).length > 0).length;

            blocks.push({
              type: "section",
              fields: [
                { type: "mrkdwn", text: `👥 Checked In: ${checkedIn}` },
                { type: "mrkdwn", text: `⚪ Checked Out: ${checkedOut}` },
                { type: "mrkdwn", text: `✅ Completed: ${completed}` },
              ],
            });
            blocks.push({ type: "divider" });

            const users = new Map<string, any[]>();
            for (const log of logs) {
              const uid = log.user_id || "unknown";
              if (!users.has(uid)) users.set(uid, []);
              users.get(uid)?.push(log);
            }

            for (const [uid, userLogs] of users.entries()) {
              const userCheckedIn = userLogs.length;
              const userCompleted = userLogs.filter((l: any) => (l.completed_tasks ?? []).length > 0)
                .length;

              blocks.push({
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*<@${uid}>* — Checked in: ${userCheckedIn}, Completed days: ${userCompleted}`,
                },
              });
            }

            await postMessage(userId, "📊 Team Report", blocks);
            if (reportChannel) await postMessage(reportChannel, "📊 Team Report", blocks);
            return;
          }

          // Large range -> CSV
          const csv = generateCsv(logs);
          const filename = `report_${startDate}_to_${endDate}.csv`;
          const uploadTarget = reportChannel || userId;
          const uploadResult: any = await uploadFile(
            uploadTarget,
            filename,
            csv,
            `Report ${startDate} → ${endDate}`
          );

          const permalink = uploadResult?.file?.permalink || "(file uploaded)";
          await postMessage(userId, `📄 Report generated: ${permalink}`);
        }
      }

      // ════════════════════════════════════════
      // BUTTON ACTIONS
      // ════════════════════════════════════════
      if (type === "block_actions") {
        const action = payload.actions?.[0];
        const actionId = action?.action_id;
        const triggerId = payload.trigger_id;

        console.log("🎯 ACTION:", actionId);
        console.log("📦 Full block_actions payload:", JSON.stringify(payload, null, 2));

        switch (actionId) {
          case "home_check_in":
            await checkIn(userId, today, time);
            await openModal(triggerId, preCapModal(await getLog(userId, today)));
            break;

          case "home_plan_tasks":
            await openModal(triggerId, preCapModal(await getLog(userId, today)));
            break;

          case "home_complete_tasks":
            await openModal(triggerId, postCapModal(await getLog(userId, today)));
            break;

          case "home_check_out":
            await openModal(triggerId, postCapModal(await getLog(userId, today)));
            break;

          case "home_manager_report":
            await openModal(triggerId, managerReportModal());
            break;

          case "add_task": {
            console.log("🔧 ADD_TASK button clicked");
            console.log("📦 Full block_actions payload:", JSON.stringify(payload, null, 2));
            
            const view = payload.view;
            
            if (!view || !view.id) {
              console.error("❌ CRITICAL: No view.id in payload. This is the root issue.");
              console.error("Available payload keys:", Object.keys(payload));
              break;
            }

            console.log("✅ View found. ID:", view.id);

            // Build new blocks array
            const existingBlocks = view.blocks || [];
            const taskBlocks = existingBlocks.filter((b: any) => b.type === "input" && b.block_id?.startsWith("task_"));
            const nextTaskNum = taskBlocks.length + 1;

            console.log(`📝 Current tasks: ${taskBlocks.length}, Adding Task ${nextTaskNum}`);

            // Don't add more than 10 tasks
            if (nextTaskNum > 10) {
              console.log("⚠️ Maximum 10 tasks allowed");
              break;
            }

            // Create new task block
            const newTaskBlock = {
              type: "input",
              block_id: `task_${nextTaskNum}`,
              label: { type: "plain_text", text: `Task ${nextTaskNum}` },
              element: {
                type: "plain_text_input",
                action_id: "task",
                placeholder: { type: "plain_text", text: `Enter task ${nextTaskNum}` },
              },
            };

            // Find the "add_task" actions block
            const actionsBlockIndex = existingBlocks.findIndex((b: any) => b.block_id === "add_task");
            console.log("🎯 Actions block at index:", actionsBlockIndex);

            // Insert new task block before the actions block
            const newBlocks = [...existingBlocks];
            if (actionsBlockIndex !== -1) {
              newBlocks.splice(actionsBlockIndex, 0, newTaskBlock);
            } else {
              newBlocks.push(newTaskBlock);
            }

            console.log("📊 New blocks count:", newBlocks.length);

            const viewUpdatePayload = {
              view_id: view.id,
              hash: view.hash,
              view: {
                type: "modal",
                callback_id: view.callback_id,
                title: view.title,
                submit: view.submit,
                close: view.close,
                blocks: newBlocks,
              },
            };

            console.log("📤 Calling views.update...");

            try {
              const response = await fetch("https://slack.com/api/views.update", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SLACK_BOT_TOKEN")}`,
                },
                body: JSON.stringify(viewUpdatePayload),
              });

              const result = await response.json();
              console.log("📥 views.update response:", JSON.stringify(result, null, 2));

              if (!result.ok) {
                console.error("❌ Slack API error:", result.error);
                if (result.response_metadata?.messages) {
                  console.error("Response metadata:", result.response_metadata.messages);
                }
              } else {
                console.log("✅ Modal updated successfully!");
              }
            } catch (err) {
              console.error("❌ Fetch error:", err);
            }

            break;
          }
        }

        await publishHome(userId, await buildHomeTab(userId));
      }

    } catch (err) {
      console.error("❌ Interaction error:", err);
    }
  })();

  return ack;
});