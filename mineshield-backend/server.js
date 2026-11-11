const express = require("express");
const cors = require("cors");
const path = require("path");
const config = require("./config");
const { initSchema, seedDefaultData } = require("./db/index");

const authRoutes = require("./routes/authRoutes");
const importRoutes = require("./routes/importRoutes");
const recordsRoutes = require("./routes/recordsRoutes");
const reconciliationRoutes = require("./routes/reconciliationRoutes");
const discrepancyRoutes = require("./routes/discrepancyRoutes");
const caseRoutes = require("./routes/caseRoutes");
const evidenceRoutes = require("./routes/evidenceRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const auditRoutes = require("./routes/auditRoutes");
const userRoutes = require("./routes/userRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static evidence / uploaded files
app.use("/uploads", express.static(config.localStorageDir));

// Health & Info Endpoint
app.get("/", (req, res) => {
  res.json({
    name: "MineShield API",
    description: "Mineral Transportation Record Reconciliation & Compliance Audit Platform",
    status: "Running",
    version: "3.0.0",
    database: {
      provider: config.databaseProvider,
      configuredTarget: "Azure SQL Database",
      activeEngine: config.databaseProvider === "azuresql" ? "Azure SQL (Remote)" : "SQLite3 (Local ACID Engine)"
    },
    storage: {
      provider: config.storageProvider,
      configuredTarget: "Azure Blob Storage",
      activeEngine: config.storageProvider === "azureblob" ? "Azure Blob Storage" : "Local Disk Storage Adapter"
    }
  });
});

// Mount Modular API Routes
app.get("/api/download/dossier", (req, res) => {
  const dossierPath = path.join(__dirname, "MineShield_Project_Viva_Dossier.pdf");
  res.download(dossierPath, "MineShield_Project_Viva_Dossier.pdf");
});

app.use("/api/auth", authRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/records", recordsRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/discrepancies", discrepancyRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/evidence", evidenceRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/users", userRoutes);
app.use("/api/settings", settingsRoutes);

// Backwards-compatible route for dashboard summary
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const { get } = require("./db/index");
    const [permits, discrepancies, cases, runs] = await Promise.all([
      get("SELECT COUNT(*) as count FROM PermitRecords"),
      get("SELECT COUNT(*) as count FROM Discrepancies WHERE status NOT IN ('RESOLVED', 'DISMISSED')"),
      get("SELECT COUNT(*) as count FROM ComplianceCases WHERE status NOT IN ('RESOLVED', 'CLOSED')"),
      get("SELECT COUNT(*) as count FROM ReconciliationRuns")
    ]);

    res.json({
      totalRecords: permits ? permits.count : 0,
      totalDiscrepancies: discrepancies ? discrepancies.count : 0,
      openCases: cases ? cases.count : 0,
      reconciliationRuns: runs ? runs.count : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Internal Server Error:", err);
  res.status(500).json({
    error: err.message || "An internal server error occurred.",
    stack: config.env === "development" ? err.stack : undefined
  });
});

// Auto-seed initial demonstration data if database contains no records
async function seedSampleOperationalData() {
  try {
    const { get, all, run } = require("./db/index");
    const existingPermits = await get("SELECT COUNT(*) as count FROM PermitRecords");
    if (existingPermits && existingPermits.count > 0) {
      return;
    }

    const adminUser = await get("SELECT id FROM Users WHERE username = 'admin'");
    if (!adminUser) return;

    const sampleData = require("./sample-data/sampleDataStrings");
    const importService = require("./services/importService");
    const reconciliationEngine = require("./services/reconciliationEngine");

    const permitBuf = Buffer.from(sampleData.permitsCsv, "utf8");
    const cpBuf = Buffer.from(sampleData.checkpointsCsv, "utf8");
    const wbBuf = Buffer.from(sampleData.weighbridgesCsv, "utf8");

    console.log("Auto-seeding initial operational sample data...");
    await importService.executeImport({
      fileBuffer: permitBuf,
      originalFilename: "permits.csv",
      sourceType: "PERMIT",
      userId: adminUser.id
    });

    await importService.executeImport({
      fileBuffer: cpBuf,
      originalFilename: "checkpoints.csv",
      sourceType: "CHECKPOINT",
      userId: adminUser.id
    });

    await importService.executeImport({
      fileBuffer: wbBuf,
      originalFilename: "weighbridges.csv",
      sourceType: "WEIGHBRIDGE",
      userId: adminUser.id
    });

    console.log("Running initial reconciliation on sample data...");
    await reconciliationEngine.runReconciliation({
      userId: adminUser.id,
      quantityTolerancePct: 5.0
    });

    // Seed initial demonstration compliance case
    const sampleDiscrepancies = await all("SELECT id, discrepancy_code, title FROM Discrepancies LIMIT 2");
    if (sampleDiscrepancies && sampleDiscrepancies.length > 0) {
      const caseResult = await run(
        `INSERT INTO ComplianceCases (case_code, title, description, priority, status, assigned_to, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          "CASE-2026-001",
          "Systematic Route Bypass & Tonnage Discrepancies (Hospet Corridor)",
          "Investigating recurrent discrepancies in the mineral transit corridor involving weight differences exceeding permissible tolerance and RFID tollgate bypasses.",
          "HIGH",
          "OPEN",
          adminUser.id,
          adminUser.id
        ]
      );
      const caseId = caseResult.lastID;
      for (const disc of sampleDiscrepancies) {
        await run(
          "INSERT OR IGNORE INTO CaseDiscrepancies (case_id, discrepancy_id) VALUES (?, ?)",
          [caseId, disc.id]
        );
      }
    }

    console.log("Sample demonstration data auto-seeded successfully.");
  } catch (err) {
    console.error("Warning: Could not auto-seed operational sample data:", err.message);
  }
}

// Initialize Database & Start Server
async function startServer() {
  try {
    await initSchema();
    await seedDefaultData();
    console.log("Database schema initialized and seed data verified.");

    if (process.env.NODE_ENV !== "test") {
      await seedSampleOperationalData();
    }

    if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
      app.listen(config.port, () => {
        console.log(`MineShield backend running at http://localhost:${config.port}`);
      });
    }
  } catch (err) {
    console.error("Failed to initialize MineShield backend:", err);
    process.exit(1);
  }
}

const initPromise = startServer();
app.ready = initPromise;

module.exports = app;
