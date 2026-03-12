import { getToday } from "./slack.ts";

// ──────────────────────────────────────────
// Task Planning Modal (Pre-CAP & Post-CAP)
// ──────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export function taskPlanningModal(existingLog: any = null) {
  const preCap = (existingLog?.pre_cap_tasks ?? []).join("\n");
  const postCap = (existingLog?.post_cap_tasks ?? []).join("\n");

  return {
    type: "modal",
    callback_id: "task_planning_submit",
    title: { type: "plain_text", text: "📋 Plan Your Day" },
    submit: { type: "plain_text", text: "Save Tasks" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Pre-CAP Tasks" },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Tasks you plan to work on *before* the CAP meeting. Enter one task per line.",
          },
        ],
      },
      {
        type: "input",
        block_id: "pre_cap_block",
        label: { type: "plain_text", text: "Pre-CAP Tasks" },
        element: {
          type: "plain_text_input",
          action_id: "pre_cap_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Review pull requests\nUpdate documentation\nFix login bug #234",
          },
          ...(preCap ? { initial_value: preCap } : {}),
        },
      },
      { type: "divider" },
      {
        type: "header",
        text: { type: "plain_text", text: "Post-CAP Tasks" },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "Tasks you plan to work on *after* the CAP meeting. Enter one task per line.",
          },
        ],
      },
      {
        type: "input",
        block_id: "post_cap_block",
        label: { type: "plain_text", text: "Post-CAP Tasks" },
        element: {
          type: "plain_text_input",
          action_id: "post_cap_input",
          multiline: true,
          placeholder: {
            type: "plain_text",
            text: "Implement new API endpoint\nWrite unit tests\nTeam code review",
          },
          ...(postCap ? { initial_value: postCap } : {}),
        },
      },
    ],
  };
}

// ──────────────────────────────────────────
// Task Completion Modal
// ──────────────────────────────────────────
// deno-lint-ignore no-explicit-any
export function taskCompletionModal(log: any) {
  const allTasks: string[] = [
    ...(log.pre_cap_tasks ?? []),
    ...(log.post_cap_tasks ?? []),
  ];

  const taskOptions = allTasks.map((task: string, i: number) => ({
    text: {
      type: "plain_text",
      text: task.length > 72 ? task.substring(0, 69) + "..." : task,
    },
    value: `task_${i}`,
  }));

  // deno-lint-ignore no-explicit-any
  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "End of Day Review" },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "Select the tasks you completed today and add any comments.",
        },
      ],
    },
  ];

  if (taskOptions.length > 0) {
    blocks.push({
      type: "input",
      block_id: "completed_tasks_block",
      label: { type: "plain_text", text: "Completed Tasks" },
      element: {
        type: "checkboxes",
        action_id: "completed_tasks_input",
        options: taskOptions,
      },
      optional: true,
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "⚠️ _No tasks were planned for today. You can still add comments below._",
      },
    });
  }

  blocks.push(
    { type: "divider" },
    {
      type: "input",
      block_id: "additional_completed_block",
      label: { type: "plain_text", text: "Additional Completed Tasks" },
      element: {
        type: "plain_text_input",
        action_id: "additional_completed_input",
        multiline: true,
        placeholder: {
          type: "plain_text",
          text: "Any extra tasks you completed that weren't in your plan (one per line)",
        },
      },
      optional: true,
    },
    {
      type: "input",
      block_id: "comments_block",
      label: { type: "plain_text", text: "Comments / Blockers / Notes" },
      element: {
        type: "plain_text_input",
        action_id: "comments_input",
        multiline: true,
        placeholder: {
          type: "plain_text",
          text: "Any blockers, notes, or things to carry over to tomorrow...",
        },
      },
      optional: true,
    }
  );

  return {
    type: "modal",
    callback_id: "task_completion_submit",
    title: { type: "plain_text", text: "✅ Complete Tasks" },
    submit: { type: "plain_text", text: "Submit Report" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify({ allTasks }),
    blocks,
  };
}

// ──────────────────────────────────────────
// Manager Report Date Picker Modal
// ──────────────────────────────────────────
export function managerReportModal() {
  return {
    type: "modal",
    callback_id: "manager_report_submit",
    title: { type: "plain_text", text: "📊 Team Report" },
    submit: { type: "plain_text", text: "View Report" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Select a date to view the team's daily report:",
        },
      },
      {
        type: "input",
        block_id: "report_date_block",
        label: { type: "plain_text", text: "Report Date" },
        element: {
          type: "datepicker",
          action_id: "report_date_input",
          initial_date: getToday(),
          placeholder: { type: "plain_text", text: "Select a date" },
        },
      },
    ],
  };
}
