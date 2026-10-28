-- ========================================================
-- Morasalaty 360-Degree Feedback & HR Analytics Schema
-- Isolated tables prefixed with m360_
-- ========================================================

-- 1. Cycles Table
CREATE TABLE IF NOT EXISTS m360_cycles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Users Table (17 Employees + HR Admin)
CREATE TABLE IF NOT EXISTS m360_users (
  id INTEGER PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(100) NOT NULL,
  team VARCHAR(50) NOT NULL,
  is_manager BOOLEAN DEFAULT FALSE,
  manager_id INTEGER,
  channels JSONB DEFAULT '{}'::jsonb,
  is_hr_admin BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Evaluations Table
CREATE TABLE IF NOT EXISTS m360_evaluations (
  id SERIAL PRIMARY KEY,
  cycle_id VARCHAR(50) NOT NULL DEFAULT '2026-Q1',
  evaluator_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  evaluatee_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- 'in_progress' | 'completed'
  progress_pct INTEGER DEFAULT 0,
  module_answers JSONB DEFAULT '{}'::jsonb,
  text_answers JSONB DEFAULT '{}'::jsonb,
  manager_answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT m360_unique_eval_cycle UNIQUE (cycle_id, evaluator_id, evaluatee_id),
  CONSTRAINT m360_no_self_eval CHECK (evaluator_id <> evaluatee_id)
);

-- 4. Sessions Table (for Token-based Auth)
CREATE TABLE IF NOT EXISTS m360_sessions (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluator ON m360_evaluations(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_m360_eval_evaluatee ON m360_evaluations(evaluatee_id);
CREATE INDEX IF NOT EXISTS idx_m360_eval_status ON m360_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_m360_sessions_token ON m360_sessions(token);
