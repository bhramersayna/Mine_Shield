-- ============================================================================
-- MineShield: Azure SQL Database DDL (T-SQL / SQL Server Production Schema)
-- Operational Mineral Transportation Reconciliation & Compliance Audit Platform
-- ============================================================================

-- 1. Users Table (RBAC: Administrator, ComplianceReviewer, ReadOnlyAuditor)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
BEGIN
  CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(200) NOT NULL,
    email NVARCHAR(200) UNIQUE NOT NULL,
    role NVARCHAR(50) NOT NULL CHECK(role IN ('Administrator', 'ComplianceReviewer', 'ReadOnlyAuditor')),
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 2. DataImports Table (Tracks batch import metadata, file hashes, outcomes)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DataImports' AND xtype='U')
BEGIN
  CREATE TABLE DataImports (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_type NVARCHAR(50) NOT NULL CHECK(source_type IN ('PERMIT', 'CHECKPOINT', 'WEIGHBRIDGE')),
    file_name NVARCHAR(255) NOT NULL,
    file_hash NVARCHAR(128) NOT NULL,
    file_size BIGINT NOT NULL,
    total_rows INT DEFAULT 0,
    accepted_rows INT DEFAULT 0,
    rejected_rows INT DEFAULT 0,
    status NVARCHAR(50) DEFAULT 'COMPLETED' CHECK(status IN ('PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL')),
    uploaded_by INT REFERENCES Users(id),
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 3. ImportRowErrors Table (Captures rejected rows and validation error details)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ImportRowErrors' AND xtype='U')
BEGIN
  CREATE TABLE ImportRowErrors (
    id INT IDENTITY(1,1) PRIMARY KEY,
    import_id INT NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
    row_number INT NOT NULL,
    raw_row_json NVARCHAR(MAX) NOT NULL,
    error_message NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 4. PermitRecords Table (Normalized operational mining transportation permits)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PermitRecords' AND xtype='U')
BEGIN
  CREATE TABLE PermitRecords (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_permit_no NVARCHAR(100) NOT NULL,
    vehicle_no NVARCHAR(50) NOT NULL,
    vehicle_no_norm NVARCHAR(50) NOT NULL,
    mineral_type NVARCHAR(100) NOT NULL,
    authorized_quantity FLOAT NOT NULL CHECK(authorized_quantity > 0),
    origin NVARCHAR(200) NOT NULL,
    destination NVARCHAR(200) NOT NULL,
    issue_timestamp DATETIME2,
    valid_until DATETIME2,
    source_system NVARCHAR(100) DEFAULT 'MINING_PORTAL',
    import_id INT NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 5. CheckpointRecords Table (Surveillance & RFID checkpoint observations)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CheckpointRecords' AND xtype='U')
BEGIN
  CREATE TABLE CheckpointRecords (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_event_id NVARCHAR(100) NOT NULL,
    permit_no NVARCHAR(100),
    vehicle_no NVARCHAR(50) NOT NULL,
    vehicle_no_norm NVARCHAR(50) NOT NULL,
    checkpoint_id NVARCHAR(100) NOT NULL,
    checkpoint_name NVARCHAR(200) NOT NULL,
    event_timestamp DATETIME2 NOT NULL,
    recorded_quantity FLOAT,
    direction NVARCHAR(50) DEFAULT 'OUTBOUND',
    source_system NVARCHAR(100) DEFAULT 'RFID_POST',
    import_id INT NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 6. WeighbridgeRecords Table (Scale measurement slips & transactions)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WeighbridgeRecords' AND xtype='U')
BEGIN
  CREATE TABLE WeighbridgeRecords (
    id INT IDENTITY(1,1) PRIMARY KEY,
    source_transaction_id NVARCHAR(100) NOT NULL,
    permit_no NVARCHAR(100),
    vehicle_no NVARCHAR(50) NOT NULL,
    vehicle_no_norm NVARCHAR(50) NOT NULL,
    weighbridge_id NVARCHAR(100) NOT NULL,
    gross_weight FLOAT,
    tare_weight FLOAT,
    net_weight FLOAT NOT NULL CHECK(net_weight >= 0),
    measurement_timestamp DATETIME2 NOT NULL,
    source_system NVARCHAR(100) DEFAULT 'WEIGHBRIDGE_SCALE',
    import_id INT NOT NULL REFERENCES DataImports(id) ON DELETE CASCADE,
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 7. ReconciliationRuns Table (Audit of reconciliation executions)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReconciliationRuns' AND xtype='U')
BEGIN
  CREATE TABLE ReconciliationRuns (
    id INT IDENTITY(1,1) PRIMARY KEY,
    run_code NVARCHAR(100) UNIQUE NOT NULL,
    status NVARCHAR(50) DEFAULT 'COMPLETED' CHECK(status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
    total_permits_processed INT DEFAULT 0,
    total_matched INT DEFAULT 0,
    total_unmatched INT DEFAULT 0,
    discrepancies_flagged INT DEFAULT 0,
    quantity_tolerance_pct FLOAT DEFAULT 5.0,
    initiated_by INT REFERENCES Users(id),
    started_at DATETIME2 DEFAULT GETUTCDATE(),
    completed_at DATETIME2
  );
END;

-- 8. ReconciliationMatches Table (Multi-source link outcomes & confidence)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ReconciliationMatches' AND xtype='U')
BEGIN
  CREATE TABLE ReconciliationMatches (
    id INT IDENTITY(1,1) PRIMARY KEY,
    run_id INT NOT NULL REFERENCES ReconciliationRuns(id) ON DELETE CASCADE,
    permit_id INT REFERENCES PermitRecords(id),
    checkpoint_id INT REFERENCES CheckpointRecords(id),
    weighbridge_id INT REFERENCES WeighbridgeRecords(id),
    match_type NVARCHAR(50) NOT NULL CHECK(match_type IN ('EXACT', 'PROBABLE', 'AMBIGUOUS', 'UNMATCHED')),
    match_confidence FLOAT DEFAULT 1.0,
    match_criteria NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 9. Discrepancies Table (Flagged anomalies for human compliance review)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Discrepancies' AND xtype='U')
BEGIN
  CREATE TABLE Discrepancies (
    id INT IDENTITY(1,1) PRIMARY KEY,
    discrepancy_code NVARCHAR(100) UNIQUE NOT NULL,
    run_id INT NOT NULL REFERENCES ReconciliationRuns(id) ON DELETE CASCADE,
    category NVARCHAR(50) NOT NULL CHECK(category IN (
      'QUANTITY_MISMATCH',
      'MISSING_CHECKPOINT',
      'MISSING_WEIGHBRIDGE',
      'VEHICLE_MISMATCH',
      'DUPLICATE_RECORD',
      'INCOMPLETE_RECORD',
      'AMBIGUOUS_MATCH',
      'CROSS_SOURCE_INCONSISTENCY'
    )),
    severity NVARCHAR(50) NOT NULL CHECK(severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status NVARCHAR(50) NOT NULL DEFAULT 'NEW' CHECK(status IN (
      'NEW',
      'UNDER_REVIEW',
      'AWAITING_EVIDENCE',
      'ESCALATED',
      'RESOLVED',
      'DISMISSED'
    )),
    rule_id NVARCHAR(100) NOT NULL,
    title NVARCHAR(255) NOT NULL,
    explanation NVARCHAR(MAX) NOT NULL,
    permit_id INT REFERENCES PermitRecords(id),
    checkpoint_id INT REFERENCES CheckpointRecords(id),
    weighbridge_id INT REFERENCES WeighbridgeRecords(id),
    expected_value NVARCHAR(255),
    observed_value NVARCHAR(255),
    variance_amount FLOAT,
    assigned_to INT REFERENCES Users(id),
    resolution_summary NVARCHAR(MAX),
    resolved_at DATETIME2,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 10. DiscrepancyNotes Table (Reviewer investigation notes and status audit)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DiscrepancyNotes' AND xtype='U')
BEGIN
  CREATE TABLE DiscrepancyNotes (
    id INT IDENTITY(1,1) PRIMARY KEY,
    discrepancy_id INT NOT NULL REFERENCES Discrepancies(id) ON DELETE CASCADE,
    author_id INT REFERENCES Users(id),
    note_text NVARCHAR(MAX) NOT NULL,
    status_change NVARCHAR(100),
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 11. ComplianceCases Table (Formal investigation cases grouping related discrepancies)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ComplianceCases' AND xtype='U')
BEGIN
  CREATE TABLE ComplianceCases (
    id INT IDENTITY(1,1) PRIMARY KEY,
    case_code NVARCHAR(100) UNIQUE NOT NULL,
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX) NOT NULL,
    priority NVARCHAR(50) NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status NVARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK(status IN (
      'OPEN',
      'IN_INVESTIGATION',
      'AWAITING_INFORMATION',
      'ESCALATED',
      'RESOLVED',
      'CLOSED'
    )),
    assigned_to INT REFERENCES Users(id),
    decision_summary NVARCHAR(MAX),
    created_by INT REFERENCES Users(id),
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    resolved_at DATETIME2
  );
END;

-- 12. CaseDiscrepancies Join Table (Many-to-Many: Cases & Discrepancies)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CaseDiscrepancies' AND xtype='U')
BEGIN
  CREATE TABLE CaseDiscrepancies (
    case_id INT NOT NULL REFERENCES ComplianceCases(id) ON DELETE CASCADE,
    discrepancy_id INT NOT NULL REFERENCES Discrepancies(id) ON DELETE CASCADE,
    linked_at DATETIME2 DEFAULT GETUTCDATE(),
    PRIMARY KEY (case_id, discrepancy_id)
  );
END;

-- 13. Evidence Table (Supporting documents, slips, photos)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Evidence' AND xtype='U')
BEGIN
  CREATE TABLE Evidence (
    id INT IDENTITY(1,1) PRIMARY KEY,
    original_filename NVARCHAR(255) NOT NULL,
    stored_filename NVARCHAR(255) NOT NULL,
    file_type NVARCHAR(50) NOT NULL,
    file_size BIGINT NOT NULL,
    sha256_hash NVARCHAR(128),
    description NVARCHAR(MAX),
    discrepancy_id INT REFERENCES Discrepancies(id) ON DELETE SET NULL,
    case_id INT REFERENCES ComplianceCases(id) ON DELETE SET NULL,
    uploaded_by INT REFERENCES Users(id),
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 14. AuditLogs Table (Append-only activity ledger)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditLogs' AND xtype='U')
BEGIN
  CREATE TABLE AuditLogs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    actor_id INT REFERENCES Users(id),
    actor_username NVARCHAR(100),
    action NVARCHAR(100) NOT NULL,
    resource_type NVARCHAR(100) NOT NULL,
    resource_id NVARCHAR(100),
    metadata_json NVARCHAR(MAX),
    outcome NVARCHAR(50) NOT NULL DEFAULT 'SUCCESS' CHECK(outcome IN ('SUCCESS', 'FAILURE')),
    created_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- 15. Settings Table (Configurable reconciliation thresholds)
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Settings' AND xtype='U')
BEGIN
  CREATE TABLE Settings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    setting_key NVARCHAR(100) UNIQUE NOT NULL,
    setting_value NVARCHAR(MAX) NOT NULL,
    description NVARCHAR(MAX),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
  );
END;

-- Azure SQL Indexes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_permits_source_permit_no')
  CREATE INDEX idx_permits_source_permit_no ON PermitRecords(source_permit_no);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_permits_vehicle_norm')
  CREATE INDEX idx_permits_vehicle_norm ON PermitRecords(vehicle_no_norm);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_checkpoints_permit_no')
  CREATE INDEX idx_checkpoints_permit_no ON CheckpointRecords(permit_no);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_checkpoints_vehicle_norm')
  CREATE INDEX idx_checkpoints_vehicle_norm ON CheckpointRecords(vehicle_no_norm);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_weighbridges_permit_no')
  CREATE INDEX idx_weighbridges_permit_no ON WeighbridgeRecords(permit_no);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_weighbridges_vehicle_norm')
  CREATE INDEX idx_weighbridges_vehicle_norm ON WeighbridgeRecords(vehicle_no_norm);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_discrepancies_category')
  CREATE INDEX idx_discrepancies_category ON Discrepancies(category);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_discrepancies_status')
  CREATE INDEX idx_discrepancies_status ON Discrepancies(status);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_discrepancies_severity')
  CREATE INDEX idx_discrepancies_severity ON Discrepancies(severity);
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_audit_logs_action')
  CREATE INDEX idx_audit_logs_action ON AuditLogs(action);
