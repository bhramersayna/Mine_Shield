# MineShield Team Contributions & Collaboration Specification

This document formalizes the division of responsibilities, codebase ownership, academic report assignments, and onboarding workflows for the two-member engineering team.

---

## 👥 Engineering Team Overview

| Attribute | Member 1 (Project Owner) | Member 2 (Collaborator) |
| :--- | :--- | :--- |
| **Full Name** | Bhramer Sayna | Collaborator Team Member |
| **GitHub Handle** | [`bhramersayna`](https://github.com/bhramersayna) | [`iblamephysixs`](https://github.com/iblamephysixs) |
| **Primary Engineering Role** | Backend Architecture, Engine & Database Lead | Frontend Engineering, Application Security & QA Lead |
| **System Ownership** | Ingestion, Reconciliation Engine, 3NF Database, Cloud Adapters | React SPA (11 Views), Server RBAC, Security Defense, 24 Integration Tests |

---

## 📁 Codebase & File Ownership Matrix

```
MineShield/
├── mineshield-backend/
│   ├── db/
│   │   ├── index.js                  ── Owned by Member 1 (Database Provider Abstraction)
│   │   ├── schema.sql                ── Owned by Member 1 (15-Table Relational Schema)
│   │   ├── azureSqlProvider.js       ── Owned by Member 1 (Azure SQL Enterprise Provider)
│   │   └── schema.azure.sql          ── Owned by Member 1 (Azure T-SQL DDL Definition)
│   ├── middleware/
│   │   ├── auth.js                   ── Owned by Member 2 (JWT & Server-Side RBAC Guards)
│   │   └── rateLimiter.js            ── Owned by Member 2 (Sliding Window Abuse Protection)
│   ├── routes/
│   │   ├── authRoutes.js             ── Jointly Reviewed (API Contract by M1, Security by M2)
│   │   ├── importRoutes.js           ── Owned by Member 1 (CSV Ingestion Endpoints)
│   │   ├── recordsRoutes.js          ── Owned by Member 1 (Normalized Search & Retrieval)
│   │   ├── reconciliationRoutes.js   ── Owned by Member 1 (Reconciliation Engine Triggers)
│   │   ├── discrepancyRoutes.js      ── Jointly Owned (M1 Engine Linkage, M2 Lifecycle)
│   │   ├── caseRoutes.js             ── Jointly Owned (Workflow State Machine)
│   │   ├── evidenceRoutes.js         ── Owned by Member 2 (Evidence Vault & Hashing)
│   │   ├── analyticsRoutes.js        ── Owned by Member 1 (SQL Aggregations & Analytics)
│   │   ├── auditRoutes.js            ── Owned by Member 2 (Immutable Audit Log Stream)
│   │   └── settingsRoutes.js         ── Owned by Member 1 (Runtime Configuration)
│   ├── services/
│   │   ├── reconciliationEngine.js   ── Owned by Member 1 (All 8 Reconciliation Rules)
│   │   ├── importService.js          ── Owned by Member 1 (CSV Streaming & Normalization)
│   │   ├── storageService.js         ── Jointly Owned (Local & Azure Blob Abstraction)
│   │   └── auditService.js           ── Owned by Member 2 (Security Event Logging)
│   ├── utils/
│   │   ├── fileValidation.js         ── Owned by Member 2 (Magic-Byte MIME Inspection)
│   │   └── csvSanitizer.js           ── Owned by Member 2 (Formula Injection Defense)
│   ├── test.js                       ── Owned by Member 2 (24 Integration Tests Suite)
│   ├── server.js                     ── Owned by Member 1 (Server Startup & Lifecycle)
│   └── seed-sample.js                ── Owned by Member 1 (Operational Demonstration Data)
│
├── mineshield-frontend/
│   ├── src/
│   │   ├── App.jsx                   ── Owned by Member 2 (11 Operational Modular Views)
│   │   ├── App.css                   ── Owned by Member 2 (Responsive Grid / Visual Styling)
│   │   ├── index.css                 ── Owned by Member 2 (Global Typography & Resets)
│   │   └── main.jsx                  ── Owned by Member 2 (React 19 Application Mount)
│   ├── public/                       ── Owned by Member 2 (SVG Icons & Branding Assets)
│   └── vite.config.js                ── Owned by Member 2 (Vite Build Configuration)
│
└── docs/                             ── Joint Engineering Documentation
```

---

## 📑 Academic Report & Viva Defense Division

For the comprehensive end-semester academic project report and viva presentation, the sections are divided based on technical ownership:

### Member 1 (`bhramersayna`) — Report & Viva Scope
1. **Chapter 1: Introduction & Problem Landscape**
   - Mineral transportation leakage, illicit transit avenues, economic deficits, and statutory mandates.
2. **Chapter 3: System Architecture & Relational Data Engineering**
   - Third Normal Form (3NF) relational database design (15 tables).
   - Foreign key cascades, composite indices, and atomic transaction rollback semantics.
   - Dual-engine persistence abstraction (SQLite3 local development vs. Azure SQL enterprise cloud).
3. **Chapter 4: Tri-Source Ingestion & Reconciliation Engine**
   - Streaming CSV parsing, schema autodetection, and row-level diagnostic error logs.
   - Algorithmic implementation of all 8 reconciliation rules.
   - Invariant preservation: Source-availability checks, idempotence, and changed-data auto-resolution.
4. **Chapter 6.1: Backend Integration Architecture**
   - RESTful API contracts, controller-service-repository patterns, and performance scaling.
5. **Appendix A: Relational Schema DDL & Azure T-SQL Scripts**

### Member 2 (`iblamephysixs`) — Report & Viva Scope
1. **Chapter 2: Literature Review & Security Standards**
   - Audit trail tamper resistance, OWASP application security in logistics portals.
2. **Chapter 5: Frontend Architecture & User Experience Design**
   - React 19 single-page architecture, component composition, and state synchronization.
   - Walkthrough of the 11 interactive views: Overview, Records, Imports, Reconciliation, Discrepancies, Compliance Cases, Evidence Vault, Analytics, Audit Logs, Users, and Settings.
3. **Chapter 6.2: Comprehensive Application Security & Threat Mitigation**
   - Defense against client-side bypass: Server-side RBAC enforcement.
   - Brute-force mitigation: Sliding window rate limiting.
   - Storage vault protection: Magic-byte inspection and SHA-256 tamper verification.
   - Export safety: CSV formula injection neutralization (RFC-4180).
4. **Chapter 6.3: Automated Quality Assurance & Verification**
   - Architecture of the 24 automated integration tests.
   - Boundary condition testing, edge cases, and Vite production bundle verification.
5. **Chapter 7: Conclusion & Future Roadmap**
6. **Appendix B: API Contracts Reference & Viva Defense Cheat Sheet**

---

## 🤝 Collaborator Onboarding Workflow for `iblamephysixs`

To ensure genuine, verifiable Git contributions without artificial commit backdating or author impersonation, Member 2 follows this workflow:

### Step 1: Accept Repository Collaboration
Member 1 (`bhramersayna`) invites `iblamephysixs` as a Collaborator on GitHub under:
`https://github.com/bhramersayna/MineShield/settings/access`

Member 2 (`iblamephysixs`) accepts the email/web invitation.

### Step 2: Clone Repository Locally
```bash
git clone https://github.com/bhramersayna/MineShield.git
cd MineShield
```

### Step 3: Configure Authentic Git Identity
Member 2 configures their local git identity to match their verified GitHub account:
```bash
git config user.name "iblamephysixs"
git config user.email "your_registered_github_email@example.com"
```

### Step 4: Create Dedicated Feature Branches
Never push directly to `main`. Create descriptive branches for assigned work:
```bash
# Example for frontend improvements:
git checkout -b feature/frontend-ux-enhancements

# Example for security checks:
git checkout -b feature/security-audit-hardening
```

### Step 5: Test, Commit & Push
Before committing, ensure tests and build pass:
```bash
# Verify backend integration tests:
npm test --prefix mineshield-backend

# Verify frontend build:
npm run build --prefix mineshield-frontend

# Commit changes with clear messages:
git add mineshield-frontend/src/
git commit -m "feat(frontend): enhance discrepancy filter controls and responsive table layouts"

# Push feature branch:
git push -u origin feature/frontend-ux-enhancements
```

### Step 6: Submit Pull Request & Merge
1. Open a Pull Request on GitHub from `feature/...` into `main`.
2. Assign Member 1 (`bhramersayna`) as Reviewer.
3. Once approved, merge the Pull Request into `main`.
4. This ensures both members have authentic, timestamped commit histories and contributions displayed on GitHub.
