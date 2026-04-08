-- ══════════════════════════════════════════════════════════
-- Daily Workflow Bot — Supabase Schema
-- ══════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────────────────
-- Main table: daily work logs
-- ──────────────────────────────────────────
CREATE TABLE daily_logs (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id             TEXT NOT NULL,
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_time       TEXT,
  check_out_time      TEXT,
  pre_cap_tasks       JSONB DEFAULT '[]'::jsonb,
  post_cap_tasks      JSONB DEFAULT '[]'::jsonb,
  completed_tasks     JSONB DEFAULT '[]'::jsonb,
  completion_comments TEXT,
  status              TEXT DEFAULT 'checked_in'
                        CHECK (status IN ('checked_in', 'tasks_set', 'completed', 'checked_out')),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  UNIQUE (user_id, date)
);

-- Indexes for fast lookups
CREATE INDEX idx_daily_logs_date ON daily_logs (date);
CREATE INDEX idx_daily_logs_user ON daily_logs (user_id);
CREATE INDEX idx_daily_logs_status ON daily_logs (status);
CREATE INDEX idx_daily_logs_user_date ON daily_logs (user_id, date);

-- ──────────────────────────────────────────
-- Auto-update updated_at on row changes
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_logs_updated_at
  BEFORE UPDATE ON daily_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────
-- Config table for workspace settings
-- ──────────────────────────────────────────
CREATE TABLE workspace_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert default config (update these after setup)
INSERT INTO workspace_config (key, value) VALUES
  ('manager_report_channel', 'C0000000000'),
  ('manager_user_ids', ''),
  ('timezone', 'Africa/Douala');

-- ──────────────────────────────────────────
-- Slack users lookup table for readable names
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slack_users (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION slack_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER slack_users_update_timestamp
  BEFORE UPDATE ON slack_users
  FOR EACH ROW
  EXECUTE FUNCTION slack_users_updated_at();

-- ──────────────────────────────────────────
-- Helper view: today's summary for managers
-- ──────────────────────────────────────────
CREATE OR REPLACE VIEW daily_summary AS
SELECT
  date,
  COUNT(*)                                          AS total_checked_in,
  COUNT(*) FILTER (WHERE status = 'checked_out')    AS total_checked_out,
  COUNT(*) FILTER (WHERE pre_cap_tasks != '[]'::jsonb
                      OR post_cap_tasks != '[]'::jsonb) AS total_with_tasks,
  COUNT(*) FILTER (WHERE completed_tasks != '[]'::jsonb) AS total_completed
FROM daily_logs
GROUP BY date
ORDER BY date DESC;

-- ──────────────────────────────────────────
-- View joining daily_logs and slack_users for readable check-ins
-- ──────────────────────────────────────────
CREATE OR REPLACE VIEW daily_logs_with_user AS
SELECT
  dl.*,
  su.username,
  su.full_name,
  su.email,
  COALESCE(su.full_name, su.username, dl.user_id) AS display_name
FROM daily_logs dl
LEFT JOIN slack_users su ON dl.user_id = su.user_id;

-- ──────────────────────────────────────────
-- RPC: Check in (upsert)
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_in(
  p_user_id TEXT,
  p_date DATE,
  p_time TEXT
) RETURNS daily_logs AS $$
DECLARE
  result daily_logs;
BEGIN
  INSERT INTO daily_logs (user_id, date, check_in_time, status)
  VALUES (p_user_id, p_date, p_time, 'checked_in')
  ON CONFLICT (user_id, date) DO UPDATE SET
    check_in_time = p_time,
    status = CASE
      WHEN daily_logs.status = 'checked_out' THEN daily_logs.status
      ELSE 'checked_in'
    END
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────
-- RPC: Set tasks
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_tasks(
  p_user_id TEXT,
  p_date DATE,
  p_pre_cap JSONB,
  p_post_cap JSONB
) RETURNS daily_logs AS $$
DECLARE
  result daily_logs;
BEGIN
  UPDATE daily_logs
  SET pre_cap_tasks = p_pre_cap,
      post_cap_tasks = p_post_cap,
      status = 'tasks_set'
  WHERE user_id = p_user_id AND date = p_date
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────
-- RPC: Complete tasks
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_tasks(
  p_user_id TEXT,
  p_date DATE,
  p_completed JSONB,
  p_comments TEXT
) RETURNS daily_logs AS $$
DECLARE
  result daily_logs;
BEGIN
  UPDATE daily_logs
  SET completed_tasks = p_completed,
      completion_comments = p_comments,
      status = 'completed'
  WHERE user_id = p_user_id AND date = p_date
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────
-- RPC: Check out
-- ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_out(
  p_user_id TEXT,
  p_date DATE,
  p_time TEXT
) RETURNS daily_logs AS $$
DECLARE
  result daily_logs;
BEGIN
  UPDATE daily_logs
  SET check_out_time = p_time,
      status = 'checked_out'
  WHERE user_id = p_user_id AND date = p_date
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql;
