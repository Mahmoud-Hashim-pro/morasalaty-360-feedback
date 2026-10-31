-- ========================================================
-- Morasalaty 360 — reference schema
-- The app creates / upgrades this automatically (lib/schema.js),
-- additively and idempotently. This file is for reading only.
-- ========================================================

CREATE TABLE m360_cycles (
  id VARCHAR(50) PRIMARY KEY,               -- e.g. 2026-Q1, 2026-11
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,           -- exactly one active cycle
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE m360_users (
  id INTEGER PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT '',    -- job title (display only)
  team VARCHAR(50) NOT NULL DEFAULT '',     -- department code: TS / Sales / Admin / ...
  access_role VARCHAR(20),                  -- employee | manager | hr | admin  (lib/permissions.js)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash VARCHAR(255) NOT NULL,      -- scrypt$salt$hash
  is_manager BOOLEAN DEFAULT FALSE,         -- legacy mirror of access_role = 'manager'
  is_hr_admin BOOLEAN DEFAULT FALSE,        -- legacy mirror of access_role = 'admin'
  manager_id INTEGER,                       -- legacy, unused
  channels JSONB DEFAULT '{}'::jsonb,       -- legacy, unused
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Peer (360°) evaluations
CREATE TABLE m360_evaluations (
  id SERIAL PRIMARY KEY,
  cycle_id VARCHAR(50) NOT NULL,
  evaluator_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  evaluatee_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',   -- in_progress | completed (locked)
  progress_pct INTEGER DEFAULT 0,
  module_answers JSONB DEFAULT '{}'::jsonb,            -- { "m1": { "m1q1": 4 }, ... }
  text_answers JSONB DEFAULT '{}'::jsonb,              -- { "strength": "...", "improvement": "..." }
  manager_answers JSONB DEFAULT '{}'::jsonb,           -- legacy, copied to m360_reviews
  next_one_tried VARCHAR(10), next_one_feedback TEXT,  -- legacy survey answers
  next_ticket_tried VARCHAR(10), next_ticket_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT m360_unique_eval_cycle UNIQUE (cycle_id, evaluator_id, evaluatee_id),
  CONSTRAINT m360_no_self_eval CHECK (evaluator_id <> evaluatee_id)
);

-- Manager / HR / self evaluations
CREATE TABLE m360_reviews (
  id SERIAL PRIMARY KEY,
  cycle_id VARCHAR(50) NOT NULL,
  review_type VARCHAR(20) NOT NULL,         -- manager | hr | self
  evaluator_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  evaluatee_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',   -- in_progress | submitted (locked)
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,          -- { "<question id>": 1..5 | "N/A" }
  texts JSONB NOT NULL DEFAULT '{}'::jsonb,            -- { "notes": "..." } / { "initiative": "..." }
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,            -- self: { "nextOne": "yes", "nextOneFeedback": "..." }
  source VARCHAR(20) NOT NULL DEFAULT 'app',           -- app | legacy (copied from the previous version)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  CONSTRAINT m360_reviews_unique UNIQUE (cycle_id, review_type, evaluator_id, evaluatee_id),
  CONSTRAINT m360_reviews_type CHECK (review_type IN ('manager', 'hr', 'self')),
  CONSTRAINT m360_reviews_self CHECK ((review_type = 'self') = (evaluator_id = evaluatee_id))
);

CREATE TABLE m360_sessions (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,       -- SHA-256 of the session token
  user_id INTEGER NOT NULL REFERENCES m360_users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE m360_login_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE m360_meta (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
