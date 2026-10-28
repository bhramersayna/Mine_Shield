# MineShield 🛡️

**Mineral Transportation Record Reconciliation & Compliance Audit Platform**

[![Integration Tests](https://img.shields.io/badge/Integration%20Tests-24%2F24%20Passed-success.svg)](#testing-and-verification)
[![Frontend Build](https://img.shields.io/badge/Vite%20Build-Passing-brightgreen.svg)](#frontend-setup)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B%20%7C%20v20%2B-blue.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-v19-61dafb.svg)](https://react.dev)
[![License](https://img.shields.io/badge/License-ISC-lightgrey.svg)](LICENSE)

---

## 📌 Executive Summary & Problem Statement

Illegal mineral transport, overload evasion, transit discrepancies, and permit reuse cause billions in state revenue loss and severe regulatory compliance deficits. Traditional mining departments rely on fragmented, siloed record-keeping across:
1. **Mining Permit Authorities** (authorized extraction quantity, validity dates, assigned route, vehicle numbers).
2. **Automated RFID / ANPR Checkpoints** (transit timestamps, camera vehicle recognition, gate passage logs).
3. **Certified Weighbridges** (gross weight, tare weight, net recorded weight, scaling timestamps).

**MineShield** bridges these isolated operational streams through an automated, deterministic **Tri-Source Reconciliation & Audit Platform**. The system continuously ingests heterogeneous CSV feeds, matches multi-source records using normalized composite keys, isolates transit discrepancies using 8 rigorous regulatory rules, and enforces tamper-evident compliance case investigation workflows.

---

## 👥 Project Team & Role Division

MineShield is developed as a collaborative two-member engineering project with strict division of architectural and operational responsibilities:

| Team Member | GitHub Handle | Role | Core Ownership |
| :--- | :--- | :--- | :--- |
| **Member 1 (Project Owner)** | [`bhramersayna`](https://github.com/bhramersayna) | **Backend Architecture, Core Engine & Database Lead** | • Core 8-Rule Reconciliation Engine (`reconciliationEngine.js`)<br>• Relational 3NF Database Schema (15 Tables) & Migration Scripts (`schema.sql`, `index.js`)<br>• CSV Data Ingestion & Normalization Service (`importService.js`)<br>• Enterprise Azure SQL Cloud Provider & T-SQL Schema (`azureSqlProvider.js`)<br>• REST API Contracts & Backend Business Logic |
| **Member 2 (Collaborator)** | [`iblamephysixs`](https://github.com/iblamephysixs) | **Frontend Engineering, Application Security & QA Lead** | • React Single-Page Application & 11 Interactive Operational Views (`App.jsx`, `App.css`)<br>• Server-Side RBAC Enforcement & Rate Limiting (`auth.js`, `rateLimiter.js`)<br>• Evidence Vault, Magic-Byte File Validation & SHA-256 Recalculation (`fileValidation.js`)<br>• CSV Formula Injection (Spreadsheet Sanitization) Defense (`csvSanitizer.js`)<br>• 24 Automated Integration Tests & Quality Assurance (`test.js`) |

For comprehensive chapter ownership breakdown, academic report division, and collaborator workflow, see [docs/CONTRIBUTIONS.md](docs/CONTRIBUTIONS.md).

---

## 🏛️ System Architecture

MineShield follows a modular, decoupled 3-tier architecture designed for rapid local demonstration with seamless cloud enterprise scalability:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MINESHIELD FRONTEND                             │
│       React 19 SPA + Vite + Responsive CSS Grid / Custom SVG UI        │
│    (11 Views: Overview, Records, Imports, Reconciliation, Cases, ...) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / JSON REST APIs (CORS Enabled)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        MINESHIELD BACKEND                              │
│                      Express.js / Node.js Engine                       │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │ Ingestion & Mapping   │ 8-Rule Reconciler    │ Security & RBAC    │ │
│  │ (csv-parse, streaming)│ (Permit-Scale-RFID)  │ (JWT, Rate-Limit)  │ │
│  └───────────────────────┴──────────────────────┴────────────────────┘ │
│  ┌───────────────────────┬──────────────────────┬────────────────────┐ │
│  │ Compliance Cases      │ Evidence Vault       │ Immutable Audit    │ │
│  │ (State Transitions)   │ (Magic Bytes+SHA256) │ (Event Log Stream) │ │
│  └───────────────────────┴──────────────────────┴────────────────────┘ │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│          STORAGE ABSTRACTION          │ │    DATABASE ABSTRACTION      │
│ ┌──────────────────┬────────────────┐ │ │ ┌──────────────┬───────────┐ │
│ │ Local Disk       │ Azure Blob     │ │ │ │ SQLite3      │ Azure SQL │ │
│ │ (uploads/ + SHA) │ (Cloud Vault)  │ │ │ │ (Local ACID) │ (T-SQL)   │ │
│ └──────────────────┴────────────────┘ │ │ └──────────────┴───────────┘ │
└───────────────────────────────────────┘ └──────────────────────────────┘
```

Detailed architectural diagrams, ER schemas, and data flow pipelines are provided in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## ⚖️ The 8 Reconciliation Rules

The reconciliation engine matches records across Permit, Checkpoint, and Weighbridge streams and flags non-compliance under 8 strict deterministic rules:

1. **`QUANTITY_MISMATCH`**: Net weighed tonnage exceeds or falls below authorized permit quantity beyond configurable tolerance (default $\pm 5.0\%$).
2. **`MISSING_CHECKPOINT`**: Weighbridge scale recorded or permit delivered without corresponding RFID/ANPR transit detection along the designated route.
3. **`MISSING_WEIGHBRIDGE`**: Checkpoint recorded transit passage for mineral shipment with no certified weighbridge gross/tare measurement ticket.
4. **`VEHICLE_MISMATCH`**: Vehicle registration physically observed at weighbridge or checkpoint diverges from vehicle assigned on transport permit.
5. **`DUPLICATE_RECORD`**: Identical permit number, weighbridge ticket, or transit passage reused across different consignments.
6. **`INCOMPLETE_RECORD`**: Record lacks essential statutory fields (e.g., mineral type, transit timestamp, tare weight, permit validity).
7. **`AMBIGUOUS_MATCH`**: Multiple conflicting sensor/weighbridge records match the same transit window, requiring manual review.
8. **`CROSS_SOURCE_INCONSISTENCY`**: Driver identity, destination lease, or mineral category contradicts source declarations across systems.

> **Crucial Engine Invariant**: The engine never flags a source as "missing" if that data source has not been imported. When new data arrives, previous discrepancies are automatically re-evaluated and resolved without generating duplicate active records.

Full mathematical definitions, tolerance formulas, and edge case behaviors are documented in [docs/RECONCILIATION_RULES.md](docs/RECONCILIATION_RULES.md).

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** v18.0.0 or higher
- **npm** v9.0.0 or higher
- **Git**

### 1. Clone & Environment Setup
```bash
git clone https://github.com/bhramersayna/MineShield.git
cd MineShield

# Copy environment configuration
cp .env.example mineshield-backend/.env
```

### 2. Backend Setup & Startup
```bash
cd mineshield-backend
npm install

# Run database seed (initializes users, default settings, and sample data)
npm run seed

# Start development server on port 5000
npm run dev
# or: npm start
```
Backend API will be accessible at: `http://localhost:5000`

### 3. Frontend Setup & Startup
In a separate terminal:
```bash
cd mineshield-frontend
npm install

# Start Vite development server
npm run dev
```
Frontend will be accessible at: `http://localhost:5173`

---

## 🔐 Default Demonstration Accounts

The platform seeds three pre-configured accounts representing distinct administrative roles:

| Role | Username | Password | Access Privileges |
| :--- | :--- | :--- | :--- |
| **System Administrator** | `admin` | `Admin@MineShield2026` | Full platform administration, user management, system settings, import management |
| **Compliance Reviewer** | `reviewer` | `Reviewer@MineShield2026` | Discrepancy resolution, compliance case management, evidence uploads |
| **Read-Only Auditor** | `auditor` | `Auditor@MineShield2026` | Read-only inspection across all records, reconciliation logs, cases, and audit trails |

---

## 🧪 Testing and Verification

MineShield includes an automated end-to-end integration test suite containing **24 comprehensive tests** that verify all platform contracts without external dependencies:

```bash
cd mineshield-backend
npm test
```

### Verified Test Suite Breakdown:
- **Test 1**: System Health & Storage Engine
- **Test 2**: RBAC & Server Authorization Boundary Enforcement
- **Test 3**: Atomic Database Transaction Rollbacks
- **Test 4**: CSV Upload Preview & Header Mapping
- **Test 5**: Permit & Weighbridge Ingestion
- **Test 6**: Unavailable Source Isolation (Zero false missing flags)
- **Test 7**: Checkpoint Surveillance Ingestion
- **Test 8**: Duplicate File Detection via SHA-256 Content Hash
- **Test 9**: Row-Level Validation & Error Diagnostics
- **Test 10**: Search & Paginated Record Retrieval
- **Test 11**: Full Reconciliation Run Execution
- **Test 12**: Verification of All 8 Reconciliation Rules
- **Test 13**: Reconciliation Idempotence (No duplicate active discrepancies)
- **Test 14**: Changed-Data Handling & Auto-Resolution
- **Test 15**: Discrepancy Lifecycle & Mandatory Resolution Audit Notes
- **Test 16**: Compliance Case Grouping & Workflow Transitions
- **Test 17**: Evidence Storage & SHA-256 Tamper Verification
- **Test 18**: Real Query Analytics & CSV Export Generation
- **Test 19**: Immutable Audit Trail (Append-Only Event Stream)
- **Test 20**: Evidence Magic-Byte Content Inspection (Blocks spoofed extensions)
- **Test 21**: Spreadsheet Formula Injection (CSV Injection) Neutralization
- **Test 22**: Azure Cloud Adapter Fail-Fast Enforcement
- **Test 23**: Login Abuse & Rate Limiting Enforcement (HTTP 429)
- **Test 24**: Configurable Tolerance Boundary Math

To build the frontend for production:
```bash
cd mineshield-frontend
npm run build
```

Full testing documentation and test scenario descriptions are available in [docs/TESTING.md](docs/TESTING.md).

---

## 📚 Technical Documentation Directory

- 📐 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Architectural design, 3NF database schema, cloud abstraction, security mechanisms.
- 🔌 **[docs/API.md](docs/API.md)** — Complete REST API reference, request/response payloads, HTTP error codes.
- ⚖️ **[docs/RECONCILIATION_RULES.md](docs/RECONCILIATION_RULES.md)** — Mathematical logic, detection criteria, and edge-case handling for all 8 rules.
- 👥 **[docs/CONTRIBUTIONS.md](docs/CONTRIBUTIONS.md)** — Two-member workload distribution, report chapter mapping, collaborator PR workflow.
- 🧪 **[docs/TESTING.md](docs/TESTING.md)** — 24 integration test cases, verification steps, and test execution guide.

---

## 📄 License

This project is licensed under the ISC License. Designed for regulatory mineral transit audit and statutory compliance assurance.
