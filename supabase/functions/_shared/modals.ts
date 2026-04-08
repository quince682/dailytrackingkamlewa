// Modal definitions for Slack interactions

// Pre-CAP modal: enter tasks with a plus button
export function preCapModal(log: any) {
  return {
    type: "modal",
    callback_id: "precap_submit",
    title: { type: "plain_text", text: "Pre-CAP Check-in" },
    submit: { type: "plain_text", text: "Save" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "task_1",
        label: { type: "plain_text", text: "Task 1" },
        element: { type: "plain_text_input", action_id: "task" },
      },
      {
        type: "actions",
        block_id: "add_task",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "➕ Add another task" },
            action_id: "add_task",
          },
        ],
      },
    ],
  };
}

// Post-CAP modal: show tasks with status dropdowns
export function postCapModal(log: any) {
  const tasks = (log?.pre_cap_tasks ?? []) as string[];
  const blocks: any[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Select the status for each task:*"
      }
    }
  ];

  for (let i = 0; i < tasks.length; i++) {
    blocks.push({
      type: "input",
      block_id: `task_${i}`,
      label: { type: "plain_text", text: tasks[i] },
      element: {
        type: "static_select",
        action_id: "status",
        placeholder: { type: "plain_text", text: "Select status" },
        options: [
          { text: { type: "plain_text", text: "✅ Completed" }, value: "completed" },
          { text: { type: "plain_text", text: "⏳ In Progress" }, value: "in_progress" },
          { text: { type: "plain_text", text: "⚠️ Blocked" }, value: "blocked" },
        ],
      },
    });
  }

  return {
    type: "modal",
    callback_id: "postcap_submit",
    title: { type: "plain_text", text: "Post-CAP Checkout" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks,
  };
}


export function managerReportModal() {
  const today = new Date().toISOString().split("T")[0];

  return {
    type: "modal",
    callback_id: "manager_report_submit",
    title: { type: "plain_text", text: "Team Report" },
    submit: { type: "plain_text", text: "Generate" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Generate a report for one or all users over a date range."
        }
      },
      {
        type: "input",
        block_id: "user_block",
        optional: true,
        element: {
          type: "users_select",
          action_id: "user_select_input",
          placeholder: {
            type: "plain_text",
            text: "Pick a user (leave empty for all)"
          }
        },
        label: { type: "plain_text", text: "User" }
      },
      {
        type: "input",
        block_id: "start_date_block",
        element: {
          type: "datepicker",
          action_id: "start_date_input",
          initial_date: today
        },
        label: { type: "plain_text", text: "Start Date" }
      },
      {
        type: "input",
        block_id: "end_date_block",
        element: {
          type: "datepicker",
          action_id: "end_date_input",
          initial_date: today
        },
        label: { type: "plain_text", text: "End Date" }
      },
      {
        type: "input",
        block_id: "quick_filter_block",
        optional: true,
        element: {
          type: "static_select",
          action_id: "quick_filter_input",
          placeholder: {
            type: "plain_text",
            text: "Quick filter (optional)"
          },
          options: [
            {
              text: { type: "plain_text", text: "Today" },
              value: "today",
            },
            {
              text: { type: "plain_text", text: "This Week" },
              value: "this_week",
            },
          ],
        },
        label: { type: "plain_text", text: "Quick Filters" }
      }
    ]
  };
}
