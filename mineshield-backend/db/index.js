let sqlite3 = null;
let nativeSqlite = null;

try {
  sqlite3 = require("sqlite3").verbose();
} catch (e) {
  // If native sqlite3 fails (e.g. Linux GLIBC mismatch on Vercel), fallback to Node's built-in sqlite
  try {
    nativeSqlite = require("node:sqlite");
  } catch (err) {
    console.error("Neither sqlite3 nor node:sqlite could be loaded:", err);
  }
}

const fs = require("fs");
const path = require("path");
const config = require("../config");
const azureSqlProvider = require("./azureSqlProvider");

let dbInstance = null;
let nativeDbInstance = null;

// Connect to SQLite Database
function getDb() {
  if (config.databaseProvider === "azuresql") {
    throw new Error("getDb() direct SQLite instance requested but DATABASE_PROVIDER is 'azuresql'. Use run(), get(), all() abstraction.");
  }
  if (!dbInstance && !nativeDbInstance) {
    if (sqlite3) {
      dbInstance = new sqlite3.Database(config.sqlitePath);
    } else if (nativeSqlite) {
      nativeDbInstance = new nativeSqlite.DatabaseSync(config.sqlitePath);
    } else {
      throw new Error("No SQLite driver available in runtime environment.");
    }
  }
  return dbInstance || nativeDbInstance;
}

// Execute SQL query that doesn't return data or returns insert id
function run(sql, params = []) {
  if (config.databaseProvider === "azuresql") {
    return azureSqlProvider.run(sql, params);
  }

  const db = getDb();
  if (nativeDbInstance) {
    try {
      const stmt = nativeDbInstance.prepare(sql);
      const res = stmt.run(...params);
      return Promise.resolve({
        lastID: Number(res.lastInsertRowid),
        changes: res.changes
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  return new Promise((resolve, reject) => {
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

  const db = getDb();
  if (nativeDbInstance) {
    try {
      const stmt = nativeDbInstance.prepare(sql);
      const row = stmt.get(...params);
      return Promise.resolve(row || null);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  return new Promise((resolve, reject) => {
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

  const db = getDb();
  if (nativeDbInstance) {
    try {
      const stmt = nativeDbInstance.prepare(sql);
      const rows = stmt.all(...params);
      return Promise.resolve(rows || []);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  return new Promise((resolve, reject) => {
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

  const db = getDb();
  if (nativeDbInstance) {
    nativeDbInstance.exec(schemaSql);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
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
