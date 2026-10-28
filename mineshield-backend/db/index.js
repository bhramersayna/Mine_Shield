const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const config = require("../config");
const azureSqlProvider = require("./azureSqlProvider");

let dbInstance = null;

// Connect to SQLite Database
function getDb() {
  if (config.databaseProvider === "azuresql") {
    throw new Error("getDb() direct SQLite instance requested but DATABASE_PROVIDER is 'azuresql'. Use run(), get(), all() abstraction.");
  }
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(config.sqlitePath);
  }
  return dbInstance;
}

// Execute SQL query that doesn't return data or returns insert id
function run(sql, params = []) {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.run(sql, params);
  }

  return new Promise((resolve, reject) => {
    const db = getDb();
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

// Fetch single row
function get(sql, params = []) {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.get(sql, params);
  }

  return new Promise((resolve, reject) => {
    const db = getDb();
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Fetch all rows
function all(sql, params = []) {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.all(sql, params);
  }

  return new Promise((resolve, reject) => {
    const db = getDb();
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Atomic transaction execution wrapper
async function transaction(callback) {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.transaction(callback);
  }

  await run("BEGIN IMMEDIATE");
  try {
    const result = await callback();
    await run("COMMIT");
    return result;
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

// Normalization helper for vehicle registration numbers (removes whitespace and hyphens, uppercase)
function normalizeVehicleNo(vehicle) {
  if (!vehicle) return "";
  return String(vehicle).trim().toUpperCase().replace(/[\s\-_]/g, "");
}

// Initialize Database Schema from schema.sql or schema.azure.sql
async function initSchema() {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.initSchema();
  }

  await run("PRAGMA foreign_keys = ON;");

  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  return new Promise((resolve, reject) => {
    const db = getDb();
    db.exec(schemaSql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// Seed default users and system settings
async function seedDefaultData() {
  const bcrypt = require("bcrypt");

  // Check if users exist
  const existingUsers = await get("SELECT COUNT(*) as count FROM Users");
  if (existingUsers.count === 0) {
    const adminHash = await bcrypt.hash("Admin@MineShield2026", 10);
    const reviewerHash = await bcrypt.hash("Reviewer@MineShield2026", 10);
    const auditorHash = await bcrypt.hash("Auditor@MineShield2026", 10);

    await run(
      `INSERT OR IGNORE INTO Users (username, password_hash, full_name, email, role) VALUES 
       (?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?),
       (?, ?, ?, ?, ?)`,
      [
        "admin", adminHash, "System Administrator", "admin@mineshield.gov.local", "Administrator",
        "reviewer", reviewerHash, "Anand V. (Lead Compliance Reviewer)", "reviewer@mineshield.gov.local", "ComplianceReviewer",
        "auditor", auditorHash, "Priya M. (Senior Audit Inspector)", "auditor@mineshield.gov.local", "ReadOnlyAuditor"
      ]
    );
  }

  // Check if settings exist
  const existingSettings = await get("SELECT COUNT(*) as count FROM Settings");
  if (existingSettings.count === 0) {
    await run(
      `INSERT OR IGNORE INTO Settings (setting_key, setting_value, description) VALUES
       (?, ?, ?),
       (?, ?, ?)`,
      [
        "quantity_tolerance_pct", "5.0", "Maximum permissible percentage difference between permit and weighbridge quantities before flagging discrepancy",
        "reconciliation_time_window_hours", "24", "Time window for probable matching between permit issue and scale measurement"
      ]
    );
  }
}

module.exports = {
  getDb,
  run,
  get,
  all,
  transaction,
  normalizeVehicleNo,
  initSchema,
  seedDefaultData
};
