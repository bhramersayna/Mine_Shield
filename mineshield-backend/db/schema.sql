-- ============================================================================
-- MineShield: Relational Schema DDL (3NF Normalized)
-- Operational Mineral Transportation Reconciliation & Compliance Audit Platform
-- ============================================================================

-- 1. Users Table (RBAC: Administrator, ComplianceReviewer, ReadOnlyAuditor)
CREATE TABLE IF NOT EXISTS Users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('Administrator', 'ComplianceReviewer', 'ReadOnlyAuditor')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. DataImports Table (Tracks batch import metadata, file hashes, outcomes)
CREATE TABLE IF NOT EXISTS DataImports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK(source_type IN ('PERMIT', 'CHECKPOINT', 'WEIGHBRIDGE')),
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  total_rows INTEGER DEFAULT 0,
  accepted_rows INTEGER DEFAULT 0,
  rejected_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL')),
  uploaded_by INTEGER REFERENCES Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. ImportRowErrors Table (Captures rejected rows and validation error details)
CREATE TABLE IF NOT EXISTS ImportRowErrors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_row_json TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. PermitRecords Table (Normalized operational mining transportation permits)
CREATE TABLE IF NOT EXISTS PermitRecords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_permit_no TEXT NOT NULL,
  vehicle_no TEXT NOT NULL,
  vehicle_no_norm TEXT NOT NULL,
  mineral_type TEXT NOT NULL,
  authorized_quantity REAL NOT NULL CHECK(authorized_quantity > 0),
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  issue_timestamp DATETIME,
  valid_until DATETIME,
  source_system TEXT DEFAULT 'MINING_PORTAL',
  import_id INTEGER NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. CheckpointRecords Table (Surveillance & RFID checkpoint observations)
CREATE TABLE IF NOT EXISTS CheckpointRecords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_event_id TEXT NOT NULL,
  permit_no TEXT,
  vehicle_no TEXT NOT NULL,
  vehicle_no_norm TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  checkpoint_name TEXT NOT NULL,
  event_timestamp DATETIME NOT NULL,
  recorded_quantity REAL,
  direction TEXT DEFAULT 'OUTBOUND',
  source_system TEXT DEFAULT 'RFID_POST',
  import_id INTEGER NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. WeighbridgeRecords Table (Scale measurement slips & transactions)
CREATE TABLE IF NOT EXISTS WeighbridgeRecords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_transaction_id TEXT NOT NULL,
  permit_no TEXT,
  vehicle_no TEXT NOT NULL,
  vehicle_no_norm TEXT NOT NULL,
  weighbridge_id TEXT NOT NULL,
  gross_weight REAL,
  tare_weight REAL,
  net_weight REAL NOT NULL CHECK(net_weight >= 0),
  measurement_timestamp DATETIME NOT NULL,
  source_system TEXT DEFAULT 'WEIGHBRIDGE_SCALE',
  import_id INTEGER NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. ReconciliationRuns Table (Audit of reconciliation executions)
CREATE TABLE IF NOT EXISTS ReconciliationRuns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  total_permits_processed INTEGER DEFAULT 0,
  total_matched INTEGER DEFAULT 0,
  total_unmatched INTEGER DEFAULT 0,
  discrepancies_flagged INTEGER DEFAULT 0,
  quantity_tolerance_pct REAL DEFAULT 5.0,
  initiated_by INTEGER REFERENCES Users(id),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- 8. ReconciliationMatches Table (Multi-source link outcomes & confidence)
CREATE TABLE IF NOT EXISTS ReconciliationMatches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ReconciliationRuns(id) ON DELETE CASCADE,
  permit_id INTEGER REFERENCES PermitRecords(id),
  checkpoint_id INTEGER REFERENCES CheckpointRecords(id),
  weighbridge_id INTEGER REFERENCES WeighbridgeRecords(id),
  match_type TEXT NOT NULL CHECK(match_type IN ('EXACT', 'PROBABLE', 'AMBIGUOUS', 'UNMATCHED')),
  match_confidence REAL DEFAULT 1.0,
  match_criteria TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9. Discrepancies Table (Flagged anomalies for human compliance review)
CREATE TABLE IF NOT EXISTS Discrepancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discrepancy_code TEXT UNIQUE NOT NULL,
  run_id INTEGER NOT NULL REFERENCES ReconciliationRuns(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (
    'QUANTITY_MISMATCH',
    'MISSING_CHECKPOINT',
    'MISSING_WEIGHBRIDGE',
    'VEHICLE_MISMATCH',
    'DUPLICATE_RECORD',
    'INCOMPLETE_RECORD',
    'AMBIGUOUS_MATCH',
    'CROSS_SOURCE_INCONSISTENCY'
  )),
  severity TEXT NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN (
    'NEW',
    'UNDER_REVIEW',
    'AWAITING_EVIDENCE',
    'ESCALATED',
    'RESOLVED',
    'DISMISSED'
  )),
  rule_id TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  permit_id INTEGER REFERENCES PermitRecords(id),
  checkpoint_id INTEGER REFERENCES CheckpointRecords(id),
  weighbridge_id INTEGER REFERENCES WeighbridgeRecords(id),
  expected_value TEXT,
  observed_value TEXT,
  variance_amount REAL,
  assigned_to INTEGER REFERENCES Users(id),
  resolution_summary TEXT,
  resolved_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. DiscrepancyNotes Table (Reviewer investigation notes and status audit)
CREATE TABLE IF NOT EXISTS DiscrepancyNotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discrepancy_id INTEGER NOT NULL REFERENCES Discrepancies(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES Users(id),
  note_text TEXT NOT NULL,
  status_change TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 11. ComplianceCases Table (Formal investigation cases grouping related discrepancies)
CREATE TABLE IF NOT EXISTS ComplianceCases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN (
    'OPEN',
    'IN_INVESTIGATION',
    'AWAITING_INFORMATION',
    'ESCALATED',
    'RESOLVED',
    'CLOSED'
  )),
  assigned_to INTEGER REFERENCES Users(id),
  decision_summary TEXT,
  created_by INTEGER REFERENCES Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);

-- 12. CaseDiscrepancies Join Table (Many-to-Many: Cases & Discrepancies)
CREATE TABLE IF NOT EXISTS CaseDiscrepancies (
  case_id INTEGER NOT NULL REFERENCES ComplianceCases(id) ON DELETE CASCADE,
  discrepancy_id INTEGER NOT NULL REFERENCES Discrepancies(id) ON DELETE CASCADE,
  linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, discrepancy_id)
);

-- 13. Evidence Table (Supporting documents, slips, photos)
CREATE TABLE IF NOT EXISTS Evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  sha256_hash TEXT,
  description TEXT,
  discrepancy_id INTEGER REFERENCES Discrepancies(id) ON DELETE SET NULL,
  case_id INTEGER REFERENCES ComplianceCases(id) ON DELETE SET NULL,
  uploaded_by INTEGER REFERENCES Users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. AuditLogs Table (Tamper-evident activity ledger)
CREATE TABLE IF NOT EXISTS AuditLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES Users(id),
  actor_username TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata_json TEXT,
  outcome TEXT NOT NULL DEFAULT 'SUCCESS' CHECK(outcome IN ('SUCCESS', 'FAILURE')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Settings Table (Configurable reconciliation thresholds)
CREATE TABLE IF NOT EXISTS Settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performant matching and query execution
CREATE INDEX IF NOT EXISTS idx_permits_source_permit_no ON PermitRecords(source_permit_no);
CREATE INDEX IF NOT EXISTS idx_permits_vehicle_norm ON PermitRecords(vehicle_no_norm);
CREATE INDEX IF NOT EXISTS idx_checkpoints_permit_no ON CheckpointRecords(permit_no);
CREATE INDEX IF NOT EXISTS idx_checkpoints_vehicle_norm ON CheckpointRecords(vehicle_no_norm);
CREATE INDEX IF NOT EXISTS idx_weighbridges_permit_no ON WeighbridgeRecords(permit_no);
CREATE INDEX IF NOT EXISTS idx_weighbridges_vehicle_norm ON WeighbridgeRecords(vehicle_no_norm);
CREATE INDEX IF NOT EXISTS idx_discrepancies_category ON Discrepancies(category);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON Discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_discrepancies_severity ON Discrepancies(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON AuditLogs(action);
