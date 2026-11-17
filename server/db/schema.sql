-- PostgreSQL-Compatible Relational Schema for Clinical Trial Match AI
-- Designed for PostgreSQL 15+ with JSONB support and strict provenance tracking.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('RESEARCH_COORDINATOR', 'CLINICIAN', 'ADMINISTRATOR')),
  organization TEXT NOT NULL,
  is_demo_user BOOLEAN NOT NULL DEFAULT FALSE,
  consent_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinical_trials (
  id TEXT PRIMARY KEY,
  nct_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  brief_title TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  interventions JSONB NOT NULL DEFAULT '[]',
  phase TEXT NOT NULL,
  recruitment_status TEXT NOT NULL,
  sponsor TEXT NOT NULL,
  summary TEXT NOT NULL,
  eligibility_criteria_raw TEXT NOT NULL,
  min_age_years INTEGER,
  max_age_years INTEGER,
  eligible_sex TEXT CHECK (eligible_sex IN ('ALL', 'FEMALE', 'MALE')),
  locations JSONB NOT NULL DEFAULT '[]',
  last_update_date TEXT NOT NULL,
  data_origin TEXT NOT NULL CHECK (data_origin IN ('PUBLIC_REGISTRY', 'SITE_VERIFIED', 'DEMO_SYNTHETIC')),
  site_verification_note TEXT,
  criteria_extracted_at TIMESTAMPTZ,
  criteria_extraction_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trial_criteria (
  id TEXT PRIMARY KEY,
  trial_id TEXT NOT NULL REFERENCES clinical_trials(id) ON DELETE CASCADE,
  criterion_type TEXT NOT NULL CHECK (criterion_type IN ('INCLUSION', 'EXCLUSION')),
  category TEXT NOT NULL,
  original_text TEXT NOT NULL,
  source_section TEXT NOT NULL,
  rule_operator TEXT NOT NULL,
  target_parameter TEXT NOT NULL,
  min_value DOUBLE PRECISION,
  max_value DOUBLE PRECISION,
  unit TEXT,
  expected_keywords JSONB DEFAULT '[]',
  requires_human_review BOOLEAN NOT NULL DEFAULT TRUE,
  review_note TEXT,
  reviewed_by_user BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  id TEXT PRIMARY KEY,
  mrn_label TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_synthetic BOOLEAN NOT NULL DEFAULT TRUE,
  age INTEGER,
  date_of_birth TEXT,
  sex TEXT NOT NULL,
  primary_diagnosis TEXT NOT NULL,
  disease_stage TEXT NOT NULL,
  ecog_status INTEGER,
  medical_history JSONB NOT NULL DEFAULT '[]',
  medications JSONB NOT NULL DEFAULT '[]',
  allergies JSONB NOT NULL DEFAULT '[]',
  previous_treatments JSONB NOT NULL DEFAULT '[]',
  pathology_info TEXT NOT NULL DEFAULT '',
  lab_results JSONB NOT NULL DEFAULT '[]',
  clinical_notes TEXT NOT NULL DEFAULT '',
  uploaded_document_name TEXT,
  missing_or_uncertain_fields JSONB NOT NULL DEFAULT '[]',
  ai_processing_authorized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracted_facts (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  numeric_value DOUBLE PRECISION,
  unit TEXT,
  test_date TEXT,
  temporal_status TEXT NOT NULL CHECK (temporal_status IN ('CURRENT', 'HISTORICAL', 'NEGATED', 'UNCERTAIN')),
  confidence TEXT NOT NULL CHECK (confidence IN ('HIGH', 'MODERATE', 'LOW')),
  uncertainty_note TEXT,
  exact_source_quote TEXT NOT NULL,
  source_location TEXT NOT NULL,
  review_status TEXT NOT NULL CHECK (review_status IN ('PENDING_REVIEW', 'APPROVED', 'EDITED', 'REJECTED')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  extraction_method TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS screening_matches (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
  trial_id TEXT NOT NULL REFERENCES clinical_trials(id) ON DELETE CASCADE,
  overall_outcome TEXT NOT NULL CHECK (overall_outcome IN ('POTENTIAL_PRE_SCREENING_MATCH', 'REQUIRES_REVIEW', 'INSUFFICIENT_INFORMATION')),
  requires_human_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  review_status TEXT NOT NULL CHECK (review_status IN ('PENDING_REVIEW', 'IN_REVIEW', 'REVIEW_COMPLETE')),
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  is_demo_generated BOOLEAN NOT NULL DEFAULT FALSE,
  summary_counts JSONB NOT NULL,
  evaluations JSONB NOT NULL DEFAULT '[]',
  missing_documentation JSONB NOT NULL DEFAULT '[]',
  reviewer_comments JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_trial_nct_id ON clinical_trials(nct_id);
CREATE INDEX IF NOT EXISTS idx_facts_patient_id ON extracted_facts(patient_id);
CREATE INDEX IF NOT EXISTS idx_matches_patient_trial ON screening_matches(patient_id, trial_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
