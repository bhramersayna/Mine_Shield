# MineShield
## Mineral Transportation Record Reconciliation & Compliance Audit Platform

MineShield is an enterprise reconciliation and audit-support platform designed to help compliance teams ingest, normalize, reconcile, investigate, and audit mineral transportation records across multi-source operational systems (state mining permit registries, highway surveillance/checkpoint RFID gates, and industrial weighbridge scales).

---

## 1. Problem Statement & Scope

Illegal mineral diversion and haulage discrepancies occur when paper slips or isolated digital records disagree between permit authorities, transit checkpoints, and destination crushers/weighbridges. MineShield provides automated multi-source data reconciliation, anomaly detection, investigation workflows, and tamper-evident audit trails.

> [!IMPORTANT]
> **Operational Reality & Scope Safeguard:**
> MineShield is an operational audit-support platform. It does **not** claim to replace government mining portals, issue legally valid permits, automatically prove fraud, or impose unilateral financial penalties. Discrepancies are flagged as potential anomalies for human compliance review.

---

## 2. System Architecture & Tech Stack

```
React + Vite Frontend (SPA)
        │
        ▼ REST / JSON APIs (JWT RBAC + Rate Limiting)
Node.js + Express Backend
        │
        ├─────────────────────────────┬─────────────────────────────┐
        ▼                             ▼                             ▼
Relational Database Engine     File Storage Engine           Audit Ledger
(SQLite3 Local Dev Engine      (Local `/uploads` Adapter      (Tamper-evident
/ Azure SQL Production Target) / Azure Blob Storage Target)   activity trail)
```

- **Frontend**: React 19, Vite 8, responsive compliance dashboard, vanilla CSS design system (11 primary navigation views).
- **Backend**: Node.js v24, Express 5, `csv-parse`, `multer`, `bcrypt`, `jsonwebtoken`, `mssql`, `@azure/storage-blob`.
- **Database**:
  - *Local Development Engine*: SQLite3 (`mineshield.db`) with foreign keys, `BEGIN IMMEDIATE` ACID transaction isolation, and prepared statements.
  - *Production Target*: Azure SQL Database (`mssql` connection pool with fail-fast validation and T-SQL schema).
- **Storage**:
  - *Local Development Adapter*: Local `/uploads` with SHA-256 cryptographic hashing and magic-byte content validation.
  - *Production Target*: Azure Blob Storage (`@azure/storage-blob` block blob client with fail-fast configuration).
- **Security Protections**:
  - Magic-byte content verification on evidence uploads (detects disguised executables).
  - Formula injection (CSV injection) neutralization (`=`, `+`, `-`, `@` character escaping).
  - In-memory rate limiting and brute-force protection on authentication endpoints.
  - 100% SQL parameterization (zero string interpolations).

---

## 3. Database Schema (3NF Normalized)

The database schema comprises 15 relational tables:
1. `Users`: System credentials with BCrypt hashing (`Administrator`, `ComplianceReviewer`, `ReadOnlyAuditor`).
2. `DataImports`: Batch import metadata, source types, SHA-256 file hashes, total/accepted/rejected counts.
3. `ImportRowErrors`: Detailed row-by-row validation error diagnostics with raw JSON data.
4. `PermitRecords`: Normalized mining transport permits (authorized quantity, origin, destination, timestamps).
5. `CheckpointRecords`: Tollgate/RFID checkpoint observations (station ID, timestamp, direction, observed quantity).
6. `WeighbridgeRecords`: Scale measurement slips (gross weight, tare weight, net weight, measurement timestamp).
7. `ReconciliationRuns`: Execution records of reconciliation jobs with tolerance parameters.
8. `ReconciliationMatches`: Link outcomes between permits, checkpoints, and weighbridges (`EXACT`, `PROBABLE`, `AMBIGUOUS`, `UNMATCHED`).
9. `Discrepancies`: Anomaly findings for human review with severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and status lifecycle.
10. `DiscrepancyNotes`: Investigation log and reviewer notes.
11. `ComplianceCases`: Formal investigation case files grouping related discrepancies.
12. `CaseDiscrepancies`: Many-to-many relationship table linking cases to discrepancies.
13. `Evidence`: Uploaded slips, certificates, and photos with SHA-256 integrity hash.
14. `AuditLogs`: Append-only system event ledger tracking all critical actions.
15. `Settings`: System-wide reconciliation tolerances and parameters.

---

## 4. Reconciliation Engine & The Eight Core Rules

MineShield implements 8 automated discrepancy detection rules:

| Rule | Category | Condition & Logic | Default Severity |
| :--- | :--- | :--- | :--- |
| **Rule 1** | `QUANTITY_MISMATCH` | Compares authorized permit tonnage against weighbridge net weight. Flags variances exceeding configurable tolerance (`quantity_tolerance_pct`, default: 5.0%). | `MEDIUM` / `HIGH` / `CRITICAL` |
| **Rule 2** | `MISSING_CHECKPOINT` | Weighbridge scale measurement exists, but no corresponding checkpoint observation was logged along the transit corridor. (Only evaluated when checkpoint source data has been imported). | `HIGH` |
| **Rule 3** | `MISSING_WEIGHBRIDGE` | Vehicle was logged departing through transit checkpoint, but no delivery scale record was registered at destination weighbridge. (Only evaluated when weighbridge source data has been imported). | `HIGH` |
| **Rule 4** | `VEHICLE_MISMATCH` | Linked records where permit number matches, but checkpoint RFID scanner or scale operator logged a different vehicle registration plate. | `HIGH` |
| **Rule 5** | `DUPLICATE_RECORD` | Repeated weighbridge transaction IDs or multiple scale measurements for the same permit. | `MEDIUM` |
| **Rule 6** | `INCOMPLETE_RECORD` | Checkpoint or scale event logged without required permit reference number. | `LOW` |
| **Rule 7** | `AMBIGUOUS_MATCH` | Vehicle observed without permit reference matches multiple candidate permits active in the same time window. | `MEDIUM` |
| **Rule 8** | `CROSS_SOURCE_INCONSISTENCY` | Contradictory physical observations between Checkpoint and Weighbridge (e.g. checkpoint recorded weight diverges from weighbridge net weight > tolerance, or checkpoint transit timestamp is after destination weighbridge timestamp). | `MEDIUM` / `HIGH` |

---

## 5. Role & Permission Matrix

| Action / Capability | Administrator | Compliance Reviewer | Read-Only Auditor |
| :--- | :---: | :---: | :---: |
| View Dashboards & Analytics | ✅ | ✅ | ✅ |
| Search Operational Records | ✅ | ✅ | ✅ |
| View Discrepancies & Details | ✅ | ✅ | ✅ |
| Preview & Ingest CSV Datasets | ✅ | ✅ | ❌ (403) |
| Execute Reconciliation Runs | ✅ | ✅ | ❌ (403) |
| Update Discrepancy Status & Notes | ✅ | ✅ | ❌ (403) |
| Create & Manage Compliance Cases | ✅ | ✅ | ❌ (403) |
| Upload Evidence Files | ✅ | ✅ | ❌ (403) |
| Download & Verify Evidence Hash | ✅ | ✅ | ✅ |
| Export Reconciliation Reports (CSV) | ✅ | ✅ | ✅ |
| View System Audit Logs | ✅ | ✅ | ✅ |
| Manage Platform Users | ✅ | ❌ (403) | ❌ (403) |
| Update Global System Settings | ✅ | ❌ (403) | ❌ (403) |

---

## 6. How to Run Locally (Windows 11)

### Prerequisites
- Node.js v20+ or v24+
- PowerShell with execution permissions (`npm.cmd`)

### A. Backend Setup
```powershell
cd C:\Users\HP\Desktop\Coding\mineshield-backend

# 1. Install dependencies
npm.cmd install

# 2. Run the 24-test platform integration suite
npm.cmd test

# 3. Clean & seed sample demonstration records
node seed-sample.js --clean

# 4. Start backend API server (runs at http://localhost:5000)
npm.cmd start
```

### B. Frontend Setup
```powershell
cd C:\Users\HP\Desktop\Coding\mineshield-frontend

# 1. Install dependencies
npm.cmd install

# 2. Verify production build
npm.cmd run build

# 3. Start development server (runs at http://localhost:5173)
npm.cmd run dev
```

---

## 7. Development Credentials

| Role | Username | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **Compliance Reviewer** | `reviewer` | `Reviewer@MineShield2026` | Ingest data, run reconciliation, investigate discrepancies, manage cases |
| **Administrator** | `admin` | `Admin@MineShield2026` | Manage users, system settings, full platform configuration |
| **Read-Only Auditor** | `auditor` | `Auditor@MineShield2026` | External audit inspection, view records, download audit reports |

---

## 8. Azure Cloud Configuration & Deployment Guide

To deploy MineShield against production Azure cloud resources, configure the environment variables in `.env`:

```env
# Relational Database Target
DATABASE_PROVIDER=azuresql
AZURE_SQL_SERVER=your-azure-sql-server.database.windows.net
AZURE_SQL_DATABASE=mineshield-db
AZURE_SQL_USER=mineshield_admin
AZURE_SQL_PASSWORD=YourStrongAzurePassword123!
# Or provide the full connection string:
# AZURE_SQL_CONNECTION_STRING=Server=tcp:yourserver.database.windows.net,1433;Database=mineshield-db;User ID=...;Password=...;Encrypt=true;

# File Storage Target
STORAGE_PROVIDER=azureblob
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=yourstorageaccount;AccountKey=yourkey==;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=mineshield-evidence
```

### Fail-Fast Guarantee
If `DATABASE_PROVIDER=azuresql` or `STORAGE_PROVIDER=azureblob` is specified without valid credentials, the application **fails fast** with an explicit diagnostic error. It will **never** silently fall back to local disk or SQLite in production mode.

---

## 9. Security Disclosures & Limitations

1. **Audit Ledger Immuntability**: The audit log is enforced as an application-level append-only ledger via database foreign keys and strict route separation (no update or deletion APIs exposed). In high-assurance legal environments, an upstream hardware WORM or hash-chained blockchain ledger should be attached.
2. **Hash Verification Scope**: SHA-256 recalculation verifies that an evidence file on disk or blob storage has not been tampered with or corrupted since upload. It verifies file integrity against the recorded hash, but does not certify real-world legal authenticity of external documents.
3. **Session Tokens**: JWT access tokens are validated with server-side HMAC-SHA256 signature verification. In the demo frontend, tokens are stored in `localStorage` for rapid role switching; in hardened public deployments, `HttpOnly` `SameSite=Strict` cookies are recommended.
