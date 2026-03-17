// Modal definitions for Slack interactions

export function preCapModal(existingLog?: any) {
  const preCapValue = existingLog?.pre_cap_tasks?.join("\n") || "";

  return {
    type: "modal",
    callback_id: "precap_submit",
    title: { type: "plain_text", text: "Check In — Pre‑CAP Tasks" },
    submit: { type: "plain_text", text: "Save" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Enter the tasks you plan to tackle today. One task per line."
        },
      },
      {
        type: "input",
        block_id: "pre_cap_block",
        element: {
          type: "plain_text_input",
          action_id: "pre_cap_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "e.g. Fix bug #123\nReview PRs\nWrite docs" },
          initial_value: preCapValue,
        },
        label: { type: "plain_text", text: "Pre‑CAP Tasks" },
      },
    ],
  };
}

export function postCapModal(existingLog?: any) {
  const completedValue = (existingLog?.completed_tasks ?? []).join("\n") || "";

  return {
    type: "modal",
    callback_id: "postcap_submit",
    title: { type: "plain_text", text: "Check Out — Post‑CAP Tasks" },
    submit: { type: "plain_text", text: "Save" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "What did you actually complete today? Add each item on its own line."
        },
      },
      {
        type: "input",
        block_id: "post_cap_block",
        element: {
          type: "plain_text_input",
          action_id: "post_cap_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "e.g. Released feature X\nFixed login bug" },
          initial_value: completedValue,
        },
        label: { type: "plain_text", text: "Post‑CAP Tasks" },
      },
    ],
  };
}

export function managerReportModal() {
  return {
    type: "modal",
    callback_id: "manager_report_submit",
    title: { type: "plain_text", text: "Team Report" },
    submit: { type: "plain_text", text: "Generate" },
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
          placeholder: { type: "plain_text", text: "Pick a user (leave empty for all)" }
        },
        label: { type: "plain_text", text: "User" }
      },
      {
        type: "input",
        block_id: "start_date_block",
        element: {
          type: "datepicker",
          action_id: "start_date_input",
          initial_date: new Date().toISOString().split('T')[0]
        },
        label: { type: "plain_text", text: "Start Date" }
      },
      {
        type: "input",
        block_id: "end_date_block",
        element: {
          type: "datepicker",
          action_id: "end_date_input",
          initial_date: new Date().toISOString().split('T')[0]
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
          placeholder: { type: "plain_text", text: "Quick filter (optional)" },
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
