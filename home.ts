import { getLog, isManager } from "./database.ts";
import { getToday, userLogSummaryBlocks } from "./slack.ts";

// ──────────────────────────────────────────
// Build the App Home Tab view for a user
// ──────────────────────────────────────────
export async function buildHomeTab(userId: string) {
  const today = getToday();
  const log = await getLog(userId, today);
  const manager = await isManager(userId);

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
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🏢 Daily Workflow Tracker" },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `📅 *Today:* ${today}  |  Welcome, <@${userId}>!`,
        },
      ],
    },
    { type: "divider" },
  ];

  if (log) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Your Status:* ${STATUS_EMOJI[log.status]} ${STATUS_LABEL[log.status]}\n*Checked in:* ${log.check_in_time || "—"}${log.check_out_time ? `  |  *Checked out:* ${log.check_out_time}` : ""}`,
      },
    });

    const preCap = log.pre_cap_tasks ?? [];
    const postCap = log.post_cap_tasks ?? [];
    if (preCap.length > 0 || postCap.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            taskListBlock("Pre-CAP Tasks", preCap, "📋"),
            taskListBlock("Post-CAP Tasks", postCap, "📋"),
          ].join("\n\n"),
        },
      });
    }

    const completed = log.completed_tasks ?? [];
    if (completed.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: taskListBlock("Completed Today", completed, "✅"),
        },
      });
    }
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "You haven't checked in yet today. Use the button below or type `/checkin` to start your day!",
      },
    });
  }

  blocks.push({ type: "divider" });

  // Action buttons
  // deno-lint-ignore no-explicit-any
  const actions: any[] = [];

  if (!log) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "☀️ Check In", emoji: true },
      action_id: "home_check_in",
      style: "primary",
    });
  }

  if (log && log.status === "checked_in") {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "📋 Plan Tasks", emoji: true },
      action_id: "home_plan_tasks",
      style: "primary",
    });
  }

  if (log && (log.status === "tasks_set" || log.status === "checked_in")) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "📝 Edit Tasks", emoji: true },
      action_id: "home_plan_tasks",
    });
  }

  if (log && log.status !== "checked_out") {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "✅ Complete Tasks", emoji: true },
      action_id: "home_complete_tasks",
    });
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "🌙 Check Out", emoji: true },
      action_id: "home_check_out",
      style: "danger",
    });
  }

  if (actions.length > 0) {
    blocks.push({ type: "actions", elements: actions });
  }

  if (manager) {
    blocks.push(
      { type: "divider" },
      {
        type: "header",
        text: { type: "plain_text", text: "👔 Manager Tools" },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "📊 View Team Report", emoji: true },
            action_id: "home_manager_report",
            style: "primary",
          },
        ],
      }
    );
  }

  return { type: "home", blocks };
}
