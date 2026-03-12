# 🏢 Slack Daily Workflow Bot — Serverless with Supabase

A **fully serverless** Slack bot for daily check-ins, task planning (Pre-CAP & Post-CAP), task completion, and manager reports — powered by **Supabase Edge Functions** and **PostgreSQL**.

**Zero servers to manage.** Everything runs on Supabase's free tier.

---

## Architecture

```
┌──────────────┐     HTTPS      ┌─────────────────────────────┐
│              │  ──────────►   │  Supabase Edge Functions     │
│  Slack App   │                │                              │
│  (Commands,  │  ◄──────────   │  ┌─────────────────────┐    │
│   Modals,    │   Slack API    │  │ slack-commands       │    │
│   Events)    │                │  │ slack-interactions   │    │
│              │                │  │ slack-events         │    │
└──────────────┘                │  └──────────┬──────────┘    │
                                │             │               │
                                │  ┌──────────▼──────────┐    │
                                │  │  Supabase PostgreSQL │    │
                                │  │  (daily_logs table)  │    │
                                │  └─────────────────────┘    │
                                └─────────────────────────────┘
```

**3 Edge Functions handle everything:**

| Function | URL Path | Purpose |
|----------|----------|---------|
| `slack-commands` | `/functions/v1/slack-commands` | All 6 slash commands |
| `slack-interactions` | `/functions/v1/slack-interactions` | Modal submissions + button clicks |
| `slack-events` | `/functions/v1/slack-events` | App Home tab updates |

---

## Features

| Feature | Command | Description |
|---------|---------|-------------|
| **Check In** | `/checkin` | Log your start time |
| **Plan Tasks** | `/tasks` | Enter Pre-CAP and Post-CAP tasks |
| **Complete Tasks** | `/complete` | Check off finished tasks + comments |
| **Check Out** | `/checkout` | Log end time + post day summary |
| **My Status** | `/mystatus` | View your status (private) |
| **Team Report** | `/report` | Manager-only: view all team activity |
| **Home Tab** | Click the app | Interactive dashboard with buttons |

---

## Setup Guide

### Prerequisites

- A Slack workspace with admin access
- A free [Supabase](https://supabase.com) account
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed

```bash
# Install Supabase CLI
npm install -g supabase
```

---

### STEP 1 — Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Name it `slack-workflow-bot`, choose a region close to you, set a DB password
4. Wait for the project to finish provisioning (~2 minutes)
5. Note your **Project URL** and **Service Role Key** from **Settings → API**

---

### STEP 2 — Set Up the Database

Go to the **SQL Editor** in your Supabase dashboard and paste the entire contents of:

```
supabase/migrations/001_create_schema.sql
```

Click **Run**. This creates the `daily_logs` table, config table, indexes, views, and all the RPC functions.

**Then update your workspace config:**

```sql
-- Replace with your actual channel ID and manager user IDs
UPDATE workspace_config SET value = 'C01YOUR_CHANNEL_ID' WHERE key = 'manager_report_channel';
UPDATE workspace_config SET value = 'U01MANAGER1,U02MANAGER2' WHERE key = 'manager_user_ids';
UPDATE workspace_config SET value = 'Africa/Douala' WHERE key = 'timezone';
```

---

### STEP 3 — Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name: `Daily Workflow Bot`, select your workspace
3. On the **Basic Information** page, copy the **Signing Secret**

---

### STEP 4 — Configure Bot Permissions

Go to **OAuth & Permissions** → add these **Bot Token Scopes**:

- `chat:write`
- `chat:write.public`
- `commands`
- `im:write`
- `users:read`

---

### STEP 5 — Install to Workspace

Go to **Install App** → **Install to Workspace** → **Allow**

Copy the **Bot User OAuth Token** (starts with `xoxb-`)

---

### STEP 6 — Deploy Edge Functions

From your project root, link to your Supabase project and set secrets:

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Set the Slack secrets
supabase secrets set SLACK_BOT_TOKEN=xoxb-your-actual-token
supabase secrets set SLACK_SIGNING_SECRET=your-actual-signing-secret

# Deploy all 3 functions
supabase functions deploy slack-commands --no-verify-jwt
supabase functions deploy slack-interactions --no-verify-jwt
supabase functions deploy slack-events --no-verify-jwt
```

Your function URLs will be:
```
https://<your-project-ref>.supabase.co/functions/v1/slack-commands
https://<your-project-ref>.supabase.co/functions/v1/slack-interactions
https://<your-project-ref>.supabase.co/functions/v1/slack-events
```

---

### STEP 7 — Configure Slack URLs

Now point Slack to your Supabase Edge Functions:

#### A) Slash Commands

Go to **Slash Commands** and create these 6 commands. Set the **Request URL** for ALL of them to:

```
https://<your-project-ref>.supabase.co/functions/v1/slack-commands
```

| Command | Description | Request URL |
|---------|-------------|-------------|
| `/checkin` | Check in to start your work day | `…/functions/v1/slack-commands` |
| `/tasks` | Plan your Pre-CAP and Post-CAP tasks | `…/functions/v1/slack-commands` |
| `/complete` | Mark tasks as completed | `…/functions/v1/slack-commands` |
| `/checkout` | Check out to end your work day | `…/functions/v1/slack-commands` |
| `/mystatus` | View your daily status | `…/functions/v1/slack-commands` |
| `/report` | View team report (managers) | `…/functions/v1/slack-commands` |

#### B) Interactivity

Go to **Interactivity & Shortcuts** → Toggle **ON** → Set **Request URL** to:

```
https://<your-project-ref>.supabase.co/functions/v1/slack-interactions
```

#### C) Events

Go to **Event Subscriptions** → Toggle **ON** → Set **Request URL** to:

```
https://<your-project-ref>.supabase.co/functions/v1/slack-events
```

Slack will send a challenge request — the function handles it automatically.

Under **Subscribe to bot events**, add:
- `app_home_opened`

Click **Save Changes**.

---

### STEP 8 — Enable Home Tab

Go to **App Home** → Toggle **Home Tab** ON.

---

### STEP 9 — Prepare Slack Workspace

1. **Create a reports channel** (e.g., `#daily-reports`)
2. **Get the Channel ID**: right-click channel → View details → scroll to bottom
3. **Get Manager User IDs**: click profile → ⋮ → Copy member ID
4. **Update the database config** (if you haven't already, run the UPDATE statements from Step 2)
5. **Invite the bot** to the reports channel: type `/invite @Daily Workflow Bot`

---

### STEP 10 — Test

| Test | Expected |
|------|----------|
| `/checkin` in any channel | Bot confirms with time, notification in manager channel |
| `/tasks` | Modal opens for Pre-CAP / Post-CAP tasks |
| `/mystatus` | Private status summary |
| `/complete` | Modal with checkboxes for your planned tasks |
| `/checkout` | Full day summary posted |
| `/report` (as manager) | Date picker → team report |
| Click the bot app | Home Tab dashboard with buttons |

---

## Project Structure

```
slack-workflow-serverless/
└── supabase/
    ├── config.toml                       # Supabase project config
    ├── .env.example                      # Environment template
    ├── migrations/
    │   └── 001_create_schema.sql         # Full DB schema + RPCs
    └── functions/
        ├── _shared/                      # Shared modules (imported by all functions)
        │   ├── database.ts               # Supabase client, DB queries, config
        │   ├── slack.ts                  # Slack API, verification, formatting
        │   ├── modals.ts                 # Modal view definitions
        │   └── home.ts                   # App Home Tab builder
        ├── slack-commands/
        │   └── index.ts                  # Handles /checkin /tasks /complete etc.
        ├── slack-interactions/
        │   └── index.ts                  # Handles modals + button clicks
        └── slack-events/
            └── index.ts                  # Handles app_home_opened
```

---

## Why Serverless with Supabase?

| | Old Version (Node.js) | This Version (Supabase) |
|---|---|---|
| **Server** | You manage a VPS/server 24/7 | No server — functions run on demand |
| **Database** | SQLite file on disk | Managed PostgreSQL with dashboard |
| **Cost** | ~$5+/month for a VPS | Free tier covers most teams |
| **Scaling** | Manual | Automatic |
| **Uptime** | You manage restarts, crashes | Supabase handles everything |
| **Data access** | SSH into server | Supabase dashboard (Table Editor) |
| **Deployment** | SSH + PM2 | `supabase functions deploy` |
| **Monitoring** | Manual log checking | Supabase dashboard + function logs |

---

## Monitoring & Management

**View function logs:**
```bash
supabase functions logs slack-commands
supabase functions logs slack-interactions
supabase functions logs slack-events
```

**View data in Supabase Dashboard:**
- Go to **Table Editor** → `daily_logs` to see all check-ins and tasks
- Go to **SQL Editor** to run custom queries:

```sql
-- Who checked in today?
SELECT user_id, check_in_time, status FROM daily_logs WHERE date = CURRENT_DATE;

-- Weekly summary
SELECT * FROM daily_summary WHERE date >= CURRENT_DATE - INTERVAL '7 days';

-- Find users who didn't check out
SELECT user_id, check_in_time FROM daily_logs
WHERE date = CURRENT_DATE AND status != 'checked_out';
```

---

## Updating

To update the code:

```bash
# Edit the function files, then redeploy
supabase functions deploy slack-commands --no-verify-jwt
supabase functions deploy slack-interactions --no-verify-jwt
supabase functions deploy slack-events --no-verify-jwt
```

No downtime — the new version is live instantly.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Slash command returns error | Check function logs: `supabase functions logs slack-commands` |
| "Invalid signature" 401 | Verify `SLACK_SIGNING_SECRET` is set correctly in secrets |
| Modal doesn't open | Check `slack-interactions` URL is set in Interactivity settings |
| Home Tab blank | Verify `app_home_opened` event is subscribed + events URL is correct |
| Bot doesn't post to channel | Invite bot to channel + check `manager_report_channel` in config table |
| Database error | Check SQL Editor → ensure migration ran successfully |

---

## License

MIT — use freely for your team.
