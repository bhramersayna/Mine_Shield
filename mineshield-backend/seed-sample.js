const fs = require("fs");
const path = require("path");
const { initSchema, seedDefaultData, get, run } = require("./db/index");
const importService = require("./services/importService");
const reconciliationEngine = require("./services/reconciliationEngine");

async function seed() {
  console.log("Seeding initial database with sample data...");
  await initSchema();
  await seedDefaultData();

  const isClean = process.argv.includes("--clean") || process.argv.includes("-c");
  if (isClean) {
    console.log("Cleaning operational tables for pristine demonstration seed...");
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
  }

  const sampleDir = path.join(__dirname, "sample-data");
  const adminUser = await get("SELECT id FROM Users WHERE username = 'admin'");

  const permitBuf = fs.readFileSync(path.join(sampleDir, "permits.csv"));
  const cpBuf = fs.readFileSync(path.join(sampleDir, "checkpoints.csv"));
  const wbBuf = fs.readFileSync(path.join(sampleDir, "weighbridges.csv"));

  // Check if permits already imported
  const existingPermits = await get("SELECT COUNT(*) as count FROM PermitRecords");
  if (existingPermits.count === 0) {
    console.log("Importing sample permits...");
    await importService.executeImport({
      fileBuffer: permitBuf,
      originalFilename: "permits.csv",
      sourceType: "PERMIT",
      userId: adminUser.id
    });

    console.log("Importing sample checkpoints...");
    await importService.executeImport({
      fileBuffer: cpBuf,
      originalFilename: "checkpoints.csv",
      sourceType: "CHECKPOINT",
      userId: adminUser.id
    });

    console.log("Importing sample weighbridges...");
    await importService.executeImport({
      fileBuffer: wbBuf,
      originalFilename: "weighbridges.csv",
      sourceType: "WEIGHBRIDGE",
      userId: adminUser.id
    });

    console.log("Running initial reconciliation...");
    await reconciliationEngine.runReconciliation({
      userId: adminUser.id,
      quantityTolerancePct: 5.0
    });
    console.log("Sample demonstration data seeded and reconciled successfully!");
  } else {
    console.log("Database already contains operational records.");
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  });
