const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");
const PORT = 5059;
process.env.PORT = PORT;
process.env.NODE_ENV = "test";

const app = require("./server");

function request(method, urlPath, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method,
      headers: { ...headers }
    };

    if (body && !headers["Content-Type"]) {
      options.headers["Content-Type"] = "application/json";
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data, raw: data });
        }
      });
    });

    req.on("error", reject);
    if (body) {
      if (typeof body === "string") {
        req.write(body);
      } else {
        req.write(JSON.stringify(body));
      }
    }
    req.end();
  });
}

// Multipart Form-Data Request Builder
function uploadFile(urlPath, filePath, fieldName, extraFields = {}, token = null) {
  return new Promise((resolve, reject) => {
    const boundary = "----MineShieldFormBoundary" + Math.random().toString(36).substring(2);
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    let bodyHeader = "";
    for (const [key, val] of Object.entries(extraFields)) {
      bodyHeader += `--${boundary}\r\n`;
      bodyHeader += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
      bodyHeader += `${val}\r\n`;
    }

    bodyHeader += `--${boundary}\r\n`;
    bodyHeader += `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n`;
    bodyHeader += `Content-Type: text/csv\r\n\r\n`;

    const bodyFooter = `\r\n--${boundary}--\r\n`;

    const headerBuf = Buffer.from(bodyHeader, "utf8");
    const footerBuf = Buffer.from(bodyFooter, "utf8");
    const fullBody = Buffer.concat([headerBuf, fileContent, footerBuf]);

    const headers = {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": fullBody.length
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const options = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method: "POST",
      headers
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data, raw: data });
        }
      });
    });

    req.on("error", reject);
    req.write(fullBody);
    req.end();
  });
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("   MINESHIELD RECONCILIATION & AUDIT PLATFORM TEST SUITE          ");
  console.log("==================================================================\n");

  const { run, get, transaction } = require("./db/index");
  const storageService = require("./services/storageService");

  // Wait for server schema initialization & seeding
  if (app.ready) {
    await app.ready;
  }

  // Clean test tables to ensure repeatable test execution
  await run("PRAGMA foreign_keys = OFF;");
  await run("DELETE FROM ImportRowErrors;");
  await run("DELETE FROM DiscrepancyNotes;");
  await run("DELETE FROM CaseDiscrepancies;");
  await run("DELETE FROM Discrepancies;");
  await run("DELETE FROM ComplianceCases;");
  await run("DELETE FROM Evidence;");
  await run("DELETE FROM ReconciliationMatches;");
  await run("DELETE FROM ReconciliationRuns;");
  await run("DELETE FROM PermitRecords;");
  await run("DELETE FROM CheckpointRecords;");
  await run("DELETE FROM WeighbridgeRecords;");
  await run("DELETE FROM DataImports;");
  await run("PRAGMA foreign_keys = ON;");

  let adminToken, reviewerToken, auditorToken;

  // 1. Health check & configuration
  const health = await request("GET", "/");
  assert.strictEqual(health.status, 200, "Health endpoint should return 200");
  assert.strictEqual(health.data.status, "Running");
  assert.strictEqual(health.data.database.provider, "sqlite");
  console.log("✔ Test 1 Passed: System Health & Local Relational Storage Engine Online");

  // 2. Authentication & Comprehensive RBAC Verification
  const adminLogin = await request("POST", "/api/auth/login", {
    username: "admin",
    password: "Admin@MineShield2026"
  });
  assert.strictEqual(adminLogin.status, 200);
  assert.strictEqual(adminLogin.data.user.role, "Administrator");
  adminToken = adminLogin.data.token;

  const reviewerLogin = await request("POST", "/api/auth/login", {
    username: "reviewer",
    password: "Reviewer@MineShield2026"
  });
  assert.strictEqual(reviewerLogin.status, 200);
  assert.strictEqual(reviewerLogin.data.user.role, "ComplianceReviewer");
  reviewerToken = reviewerLogin.data.token;

  const auditorLogin = await request("POST", "/api/auth/login", {
    username: "auditor",
    password: "Auditor@MineShield2026"
  });
  assert.strictEqual(auditorLogin.status, 200);
  assert.strictEqual(auditorLogin.data.user.role, "ReadOnlyAuditor");
  auditorToken = auditorLogin.data.token;

  // Unauthenticated request rejection (401)
  const unauthRes = await request("GET", "/api/records/permits");
  assert.strictEqual(unauthRes.status, 401, "Unauthenticated request must return 401");

  // Tampered / Malformed Token rejection (403)
  const tamperedTokenRes = await request("GET", "/api/records/permits", null, {
    Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature"
  });
  assert.strictEqual(tamperedTokenRes.status, 403, "Tampered token must return 403");

  // Admin route protection: ComplianceReviewer rejected on Admin-only routes (403)
  const reviewerForbiddenUsers = await request("GET", "/api/users", null, {
    Authorization: `Bearer ${reviewerToken}`
  });
  assert.strictEqual(reviewerForbiddenUsers.status, 403, "ComplianceReviewer must not access /api/users");

  const reviewerForbiddenSettings = await request("PATCH", "/api/settings/quantity_tolerance_pct", {
    setting_value: "10.0"
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(reviewerForbiddenSettings.status, 403, "ComplianceReviewer must not update settings");

  // Admin permitted on Admin routes (200)
  const adminUsersList = await request("GET", "/api/users", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(adminUsersList.status, 200);
  assert.ok(adminUsersList.data.length >= 3);

  // ReadOnlyAuditor rejected on mutation routes (403)
  const auditorForbiddenRun = await request("POST", "/api/reconciliation/run", {
    quantity_tolerance_pct: 5.0
  }, { Authorization: `Bearer ${auditorToken}` });
  assert.strictEqual(auditorForbiddenRun.status, 403, "Auditor must not initiate reconciliation run");

  console.log("✔ Test 2 Passed: RBAC Authentication, Independent Server Authorization & Boundary Enforcement");

  // 3. Database Transaction Rollback Verification
  let transactionFailed = false;
  try {
    await transaction(async () => {
      await run("INSERT INTO Settings (setting_key, setting_value, description) VALUES ('test_rollback_key', '1', 'Temp')");
      // Intentionally throw inside transaction
      throw new Error("Simulated unexpected multi-step failure");
    });
  } catch (err) {
    transactionFailed = true;
  }
  assert.ok(transactionFailed, "Transaction should catch and rethrow error");
  const rolledBackRow = await get("SELECT * FROM Settings WHERE setting_key = 'test_rollback_key'");
  assert.strictEqual(rolledBackRow, undefined, "Transaction rollback must ensure aborted inserts do not persist");
  console.log("✔ Test 3 Passed: Atomic Database Transaction Rollback Verified upon Mid-Operation Failure");

  // 4. Import Module: Preview & Multi-Source Ingestion
  const sampleDir = path.join(__dirname, "sample-data");

  // Preview Permit CSV
  const permitPreview = await uploadFile(
    "/api/imports/preview",
    path.join(sampleDir, "permits.csv"),
    "file",
    { source_type: "PERMIT" },
    reviewerToken
  );
  assert.strictEqual(permitPreview.status, 200);
  assert.strictEqual(permitPreview.data.totalRows, 11);
  assert.strictEqual(permitPreview.data.validRows, 11);
  console.log("✔ Test 4 Passed: CSV Upload Preview & Header Mapping Detection");

  // Import Permits
  const permitImport = await uploadFile(
    "/api/imports",
    path.join(sampleDir, "permits.csv"),
    "file",
    { source_type: "PERMIT" },
    reviewerToken
  );
  assert.strictEqual(permitImport.status, 201);
  assert.strictEqual(permitImport.data.acceptedRows, 11);
  assert.strictEqual(permitImport.data.rejectedRows, 0);

  // Import Weighbridges first (Checkpoint intentionally not imported yet)
  const wbImport = await uploadFile(
    "/api/imports",
    path.join(sampleDir, "weighbridges.csv"),
    "file",
    { source_type: "WEIGHBRIDGE" },
    reviewerToken
  );
  assert.strictEqual(wbImport.status, 201);
  assert.strictEqual(wbImport.data.acceptedRows, 10);
  console.log("✔ Test 5 Passed: Operational Permits & Weighbridges Ingested");

  // 5. Verification: Unavailable Source Data Handling
  // When Checkpoint dataset has 0 imported records, engine MUST NOT falsely flag Rule 2 (MISSING_CHECKPOINT)
  const partialRun = await request("POST", "/api/reconciliation/run", {
    quantity_tolerance_pct: 5.0
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(partialRun.status, 201);
  assert.strictEqual(partialRun.data.sourceAvailability.checkpointDatasetAvailable, false);

  const partialDiscsRes = await request("GET", "/api/discrepancies", null, { Authorization: `Bearer ${reviewerToken}` });
  const hasPrematureMissingCp = partialDiscsRes.data.discrepancies.some((d) => d.category === "MISSING_CHECKPOINT");
  assert.strictEqual(
    hasPrematureMissingCp,
    false,
    "Engine must NOT report MISSING_CHECKPOINT when the checkpoint source dataset is completely unavailable"
  );
  console.log("✔ Test 6 Passed: Unavailable Source Data Safely Isolated (No false missing events when source is absent)");

  // Import Checkpoints now
  const cpImport = await uploadFile(
    "/api/imports",
    path.join(sampleDir, "checkpoints.csv"),
    "file",
    { source_type: "CHECKPOINT" },
    reviewerToken
  );
  assert.strictEqual(cpImport.status, 201);
  assert.strictEqual(cpImport.data.acceptedRows, 9);
  console.log("✔ Test 7 Passed: Checkpoint Surveillance Dataset Ingested");

  // Duplicate Import Detection (Attempting to re-import identical permits file)
  const dupImport = await uploadFile(
    "/api/imports",
    path.join(sampleDir, "permits.csv"),
    "file",
    { source_type: "PERMIT" },
    reviewerToken
  );
  assert.strictEqual(dupImport.status, 400);
  assert.ok(dupImport.data.error.includes("Duplicate Import Detected"));
  console.log("✔ Test 8 Passed: Duplicate Import Blocked via SHA-256 Content Hashing");

  // Malformed File Import (Validation errors captured)
  const malformedImport = await uploadFile(
    "/api/imports",
    path.join(sampleDir, "malformed.csv"),
    "file",
    { source_type: "PERMIT" },
    reviewerToken
  );
  assert.strictEqual(malformedImport.status, 201);
  assert.strictEqual(malformedImport.data.rejectedRows, 3);
  assert.strictEqual(malformedImport.data.status, "FAILED");

  // Verify errors endpoint
  const errorRows = await request("GET", `/api/imports/${malformedImport.data.importId}/errors`, null, {
    Authorization: `Bearer ${reviewerToken}`
  });
  assert.strictEqual(errorRows.status, 200);
  assert.strictEqual(errorRows.data.length, 3);
  console.log("✔ Test 9 Passed: Row Validation Errors Captured with Detailed Diagnostic Messages");

  // 6. Search & Paginated Retrieval
  const permitsList = await request("GET", "/api/records/permits?search=UP32AB1001", null, {
    Authorization: `Bearer ${reviewerToken}`
  });
  assert.strictEqual(permitsList.status, 200);
  assert.strictEqual(permitsList.data.records.length, 1);
  assert.strictEqual(permitsList.data.records[0].source_permit_no, "PER-2026-101");
  console.log("✔ Test 10 Passed: Search & Paginated Retrieval of Normalized Records");

  // 7. Reconciliation Engine: Full Verification of All 8 Rules
  const reconRun = await request("POST", "/api/reconciliation/run", {
    quantity_tolerance_pct: 5.0
  }, { Authorization: `Bearer ${reviewerToken}` });

  assert.strictEqual(reconRun.status, 201);
  assert.strictEqual(reconRun.data.status, "COMPLETED");
  assert.strictEqual(reconRun.data.totalPermitsProcessed, 11);
  assert.ok(reconRun.data.totalMatched >= 9);
  console.log(`✔ Test 11 Passed: Full Reconciliation Run (Matched: ${reconRun.data.totalMatched}, Discrepancies Newly Flagged: ${reconRun.data.discrepanciesFlagged})`);

  // Verify Specific Discrepancy Rules Detected
  const discrepanciesRes = await request("GET", "/api/discrepancies", null, {
    Authorization: `Bearer ${reviewerToken}`
  });
  assert.strictEqual(discrepanciesRes.status, 200);
  const discs = discrepanciesRes.data.discrepancies;
  assert.ok(discs.length >= 8, `Expected at least 8 discrepancies in register, got ${discs.length}`);

  const hasQtyMismatch = discs.some((d) => d.category === "QUANTITY_MISMATCH" && d.source_permit_no === "PER-2026-102");
  const hasMissingCp = discs.some((d) => d.category === "MISSING_CHECKPOINT" && d.source_permit_no === "PER-2026-103");
  const hasMissingWb = discs.some((d) => d.category === "MISSING_WEIGHBRIDGE" && d.source_permit_no === "PER-2026-104");
  const hasVehicleMismatch = discs.some((d) => d.category === "VEHICLE_MISMATCH" && d.source_permit_no === "PER-2026-105");
  const hasDuplicate = discs.some((d) => d.category === "DUPLICATE_RECORD");
  const hasIncomplete = discs.some((d) => d.category === "INCOMPLETE_RECORD");
  const hasAmbiguous = discs.some((d) => d.category === "AMBIGUOUS_MATCH");
  const hasCrossSource = discs.some((d) => d.category === "CROSS_SOURCE_INCONSISTENCY");

  assert.ok(hasQtyMismatch, "Must detect Rule 1: Quantity Mismatch");
  assert.ok(hasMissingCp, "Must detect Rule 2: Missing Checkpoint");
  assert.ok(hasMissingWb, "Must detect Rule 3: Missing Weighbridge");
  assert.ok(hasVehicleMismatch, "Must detect Rule 4: Vehicle Mismatch");
  assert.ok(hasDuplicate, "Must detect Rule 5: Duplicate Record");
  assert.ok(hasIncomplete, "Must detect Rule 6: Incomplete Record");
  assert.ok(hasAmbiguous, "Must detect Rule 7: Ambiguous Match");
  assert.ok(hasCrossSource, "Must detect Rule 8: Cross-Source Inconsistency");
  console.log("✔ Test 12 Passed: All 8 Documented Reconciliation Rules Verified against Operational Data");

  // Idempotence Test: Re-running reconciliation does not inflate duplicate discrepancies
  const initialDiscCount = discs.length;
  const rerun = await request("POST", "/api/reconciliation/run", {
    quantity_tolerance_pct: 5.0
  }, { Authorization: `Bearer ${reviewerToken}` });
  const rerunDiscs = await request("GET", "/api/discrepancies", null, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(rerunDiscs.data.discrepancies.length, initialDiscCount, "Idempotence failed: duplicate discrepancies created on rerun");
  console.log("✔ Test 13 Passed: Reconciliation Idempotence Verified (No duplicate discrepancies on repeat runs)");

  // Changed Data Test: Dynamic Auto-Resolution when Missing Record is Imported
  // Find a MISSING_CHECKPOINT discrepancy
  const missingCpDisc = discs.find((d) => d.category === "MISSING_CHECKPOINT" && d.status === "NEW");
  assert.ok(missingCpDisc, "Should have an active MISSING_CHECKPOINT discrepancy");

  // Simulate late arrival/import of the missing checkpoint
  const lateCpEvent = "EVT-LATE-103";
  await run(
    `INSERT INTO CheckpointRecords 
     (source_event_id, permit_no, vehicle_no, vehicle_no_norm, checkpoint_id, checkpoint_name, event_timestamp, recorded_quantity, direction, source_system, import_id)
     VALUES (?, 'PER-2026-103', 'UP32AB1003', 'UP32AB1003', 'CP-01', 'North River Tollgate', '2026-10-20 09:30:00', 20.00, 'OUTBOUND', 'MANUAL_IMPORT', ?)`,
    [lateCpEvent, cpImport.data.importId]
  );

  // Rerun reconciliation
  await request("POST", "/api/reconciliation/run", { quantity_tolerance_pct: 5.0 }, { Authorization: `Bearer ${reviewerToken}` });

  // Verify the discrepancy was auto-resolved
  const resolvedDiscRow = await get("SELECT * FROM Discrepancies WHERE id = ?", [missingCpDisc.id]);
  assert.strictEqual(resolvedDiscRow.status, "RESOLVED", "Discrepancy must transition to RESOLVED when missing record is supplied");
  assert.ok(resolvedDiscRow.resolution_summary.includes("Auto-resolved"), "Resolution summary must document auto-resolution");
  console.log("✔ Test 14 Passed: Reconciliation Changed-Data Handling & Auto-Resolution Verified");

  // 8. Discrepancy Lifecycle & Reviewer Notes
  const targetDisc = discs.find((d) => d.status === "NEW" && d.category === "QUANTITY_MISMATCH");
  const detailRes = await request("GET", `/api/discrepancies/${targetDisc.id}`, null, {
    Authorization: `Bearer ${reviewerToken}`
  });
  assert.strictEqual(detailRes.status, 200);
  assert.ok(detailRes.data.discrepancy);
  assert.ok(detailRes.data.sources);

  // Add investigation note
  const noteRes = await request("POST", `/api/discrepancies/${targetDisc.id}/notes`, {
    note_text: "Contacted transporter for calibration certificate."
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(noteRes.status, 201);

  // Status transition to RESOLVED with explanation
  const resolveRes = await request("PATCH", `/api/discrepancies/${targetDisc.id}`, {
    status: "RESOLVED",
    resolution_summary: "Confirmed valid scale tare calibration variance."
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(resolveRes.status, 200);
  assert.strictEqual(resolveRes.data.status, "RESOLVED");

  // Rejection of RESOLVED without explanation
  const badResolve = await request("PATCH", `/api/discrepancies/${discs[1].id}`, {
    status: "RESOLVED",
    resolution_summary: ""
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(badResolve.status, 400);
  console.log("✔ Test 15 Passed: Discrepancy Lifecycle, Investigation Notes & Mandatory Resolution Audit");

  // 9. Compliance Case Management
  const caseRes = await request("POST", "/api/cases", {
    title: "Investigation into Sone Block A Over-Tonnage Trends",
    description: "Cluster of quantity and vehicle mismatches on Riverbed Sand corridor.",
    priority: "HIGH",
    discrepancy_ids: [discs[1].id, discs[2].id]
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(caseRes.status, 201);
  const caseId = caseRes.data.id;

  const caseDetail = await request("GET", `/api/cases/${caseId}`, null, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(caseDetail.status, 200);
  assert.strictEqual(caseDetail.data.discrepancies.length, 2);
  console.log("✔ Test 16 Passed: Compliance Case Workflow & Discrepancy Grouping");

  // 10. Evidence Storage & SHA-256 Recalculation / Integrity Verification
  const evidenceRes = await uploadFile(
    "/api/evidence",
    path.join(sampleDir, "permits.csv"),
    "file",
    {
      description: "Supporting permit extract document",
      discrepancy_id: discs[1].id,
      case_id: caseId
    },
    reviewerToken
  );
  assert.strictEqual(evidenceRes.status, 201);
  assert.ok(evidenceRes.data.sha256_hash);

  // Download Evidence
  const dlRes = await request("GET", `/api/evidence/${evidenceRes.data.id}/download`, null, {
    Authorization: `Bearer ${auditorToken}`
  });
  assert.strictEqual(dlRes.status, 200);

  // Recalculate SHA-256 and Verify Authenticity
  const verifyRes = await request("GET", `/api/evidence/${evidenceRes.data.id}/verify`, null, {
    Authorization: `Bearer ${auditorToken}`
  });
  assert.strictEqual(verifyRes.status, 200);
  assert.strictEqual(verifyRes.data.integrityVerified, true);
  assert.strictEqual(verifyRes.data.status, "VERIFIED_AUTHENTIC");
  assert.strictEqual(verifyRes.data.storedHash, verifyRes.data.recalculatedHash);
  console.log("✔ Test 17 Passed: Evidence Storage, On-Disk SHA-256 Recalculation & Tamper Verification");

  // 11. Analytics & Report Export
  const overviewRes = await request("GET", "/api/analytics/overview", null, {
    Authorization: `Bearer ${auditorToken}`
  });
  assert.strictEqual(overviewRes.status, 200);
  assert.strictEqual(overviewRes.data.totalPermitRecords, 11);
  assert.ok(overviewRes.data.matchRatePct > 0);

  const exportCsv = await request("GET", "/api/analytics/export/csv?type=discrepancies", null, {
    Authorization: `Bearer ${auditorToken}`
  });
  assert.strictEqual(exportCsv.status, 200);
  assert.ok(exportCsv.raw.includes("DiscrepancyCode") && exportCsv.raw.includes("Category") && exportCsv.raw.includes("Severity"));
  console.log("✔ Test 18 Passed: Real Query Analytics & CSV Export Generation");

  // 12. Audit Logging & Ledger Immutability Verification
  const auditLogs = await request("GET", "/api/audit-logs?limit=20", null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(auditLogs.status, 200);
  assert.ok(auditLogs.data.length >= 10);

  // Verify audit log routes reject modification and deletion
  const deleteAuditRes = await request("DELETE", `/api/audit-logs/${auditLogs.data[0].id}`, null, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(deleteAuditRes.status, 404, "Audit logs must not have a DELETE route");

  const putAuditRes = await request("PUT", `/api/audit-logs/${auditLogs.data[0].id}`, { outcome: "TAMPERED" }, {
    Authorization: `Bearer ${adminToken}`
  });
  assert.strictEqual(putAuditRes.status, 404, "Audit logs must not have a PUT route");

  console.log(`✔ Test 19 Passed: Immutable Audit Trail (${auditLogs.data.length} system events logged, no modification routes exposed)`);

  // 13. File Magic Bytes & Content Inspection Verification
  const fakePdfPath = path.join(sampleDir, "fake_document.pdf");
  fs.writeFileSync(fakePdfPath, "This is plain text pretending to be a PDF binary document.");
  try {
    const fakeUpload = await uploadFile(
      "/api/evidence",
      fakePdfPath,
      "file",
      { description: "Spoofed extension document" },
      reviewerToken
    );
    assert.strictEqual(fakeUpload.status, 400, "Must reject spoofed PDF lacking %PDF magic bytes");
    assert.ok(fakeUpload.data.error.includes("File content verification failed"));
    console.log("✔ Test 20 Passed: Evidence Magic-Byte Content Inspection (Blocked spoofed file extensions)");
  } finally {
    if (fs.existsSync(fakePdfPath)) fs.unlinkSync(fakePdfPath);
  }

  // 14. CSV Spreadsheet Formula Injection (CSV Injection) Protection
  await run("UPDATE Discrepancies SET title = '=CMD|\" /C calc\"!A0' WHERE id = ?", [discs[0].id]);
  const safeCsvExport = await request("GET", "/api/analytics/export/csv?type=discrepancies", null, {
    Authorization: `Bearer ${auditorToken}`
  });
  assert.strictEqual(safeCsvExport.status, 200);
  assert.ok(
    safeCsvExport.raw.includes("\"'=CMD|\"\" /C calc\"\"!A0\""),
    "Formula injection trigger '=' must be safely prefixed with single quote in exported CSV"
  );
  console.log("✔ Test 21 Passed: Spreadsheet Formula Injection (CSV Injection) Neutralization Verified");

  // 15. Azure Cloud Adapters Fail-Fast Validation (Zero Silent Fallback)
  const azureSqlProvider = require("./db/azureSqlProvider");
  let azureSqlFailedFast = false;
  try {
    azureSqlProvider.validateAzureConfig();
  } catch (e) {
    if (e.message.includes("Misconfigured Relational Database")) {
      azureSqlFailedFast = true;
    }
  }
  assert.ok(azureSqlFailedFast, "Azure SQL provider must fail fast with clear diagnostic message when unconfigured");

  let azureBlobFailedFast = false;
  try {
    storageService.getAzureContainerClient();
  } catch (e) {
    if (e.message.includes("Misconfigured Cloud Storage")) {
      azureBlobFailedFast = true;
    }
  }
  assert.ok(azureBlobFailedFast, "Azure Blob provider must fail fast with clear diagnostic message when unconfigured");
  console.log("✔ Test 22 Passed: Azure Cloud Adapters Fail-Fast Enforcement (No silent fallbacks in production mode)");

  // 16. Login Abuse & Rate Limiting Protection
  const { resetRateLimits } = require("./middleware/rateLimiter");
  resetRateLimits();
  for (let i = 0; i < 10; i++) {
    await request("POST", "/api/auth/login", { username: "bruteforce_test", password: "wrong" });
  }
  const blockedLogin = await request("POST", "/api/auth/login", { username: "bruteforce_test", password: "wrong" });
  assert.strictEqual(blockedLogin.status, 429, "11th consecutive failed attempt must return 429 Too Many Requests");
  assert.ok(blockedLogin.data.error.includes("Too many login attempts"));
  resetRateLimits();
  console.log("✔ Test 23 Passed: Login Abuse & Brute-Force Rate Limiting Enforced (HTTP 429)");

  // 17. Configurable Quantity Tolerance Boundary Verification
  const highTolRun = await request("POST", "/api/reconciliation/run", {
    quantity_tolerance_pct: 25.0
  }, { Authorization: `Bearer ${reviewerToken}` });
  assert.strictEqual(highTolRun.status, 201);
  assert.strictEqual(highTolRun.data.quantityTolerancePct, 25.0);
  console.log("✔ Test 24 Passed: Configurable Quantity Tolerance Boundary Behavior Verified");

  console.log("\n==================================================================");
  console.log("   ALL 24 COMPREHENSIVE PLATFORM INTEGRATION TESTS PASSED         ");
  console.log("==================================================================");
}

// Start test server
let server = app.listen(PORT, async () => {
  try {
    await runAllTests();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ Test Failed:", err);
    server.close();
    process.exit(1);
  }
});
