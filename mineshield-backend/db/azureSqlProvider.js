const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const config = require("../config");

let poolInstance = null;

// Validate that required Azure SQL connection parameters exist
function validateAzureConfig() {
  const hasConnString = Boolean(process.env.AZURE_SQL_CONNECTION_STRING);
  const hasExplicitConfig = Boolean(
    config.azureSql.server &&
    config.azureSql.database &&
    config.azureSql.user &&
    config.azureSql.password
  );

  if (!hasConnString && !hasExplicitConfig) {
    throw new Error(
      "Misconfigured Relational Database: DATABASE_PROVIDER is set to 'azuresql', but Azure SQL connection parameters are missing.\n" +
      "Please provide AZURE_SQL_CONNECTION_STRING or set AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_USER, and AZURE_SQL_PASSWORD in your environment.\n" +
      "To run locally without Azure credentials, set DATABASE_PROVIDER=sqlite."
    );
  }
}

// Get or initialize MSSQL Connection Pool
async function getPool() {
  if (poolInstance) return poolInstance;

  validateAzureConfig();

  const connString = process.env.AZURE_SQL_CONNECTION_STRING;
  const poolConfig = connString || {
    server: config.azureSql.server,
    database: config.azureSql.database,
    user: config.azureSql.user,
    password: config.azureSql.password,
    port: parseInt(process.env.AZURE_SQL_PORT || "1433", 10),
    options: {
      encrypt: true,
      trustServerCertificate: process.env.AZURE_SQL_TRUST_SERVER_CERT === "true"
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };

  poolInstance = await new sql.ConnectionPool(poolConfig).connect();
  return poolInstance;
}

// Convert positional '?' placeholders to T-SQL '@p1, @p2...' and bind request inputs
function prepareRequest(poolOrTxn, rawSql, params = []) {
  const req = poolOrTxn.request();
  let paramIdx = 1;
  const convertedSql = rawSql.replace(/\?/g, () => {
    const pName = `p${paramIdx}`;
    paramIdx++;
    return `@${pName}`;
  });

  for (let i = 0; i < params.length; i++) {
    const val = params[i];
    const pName = `p${i + 1}`;
    if (val === null || val === undefined) {
      req.input(pName, sql.NVarChar, null);
    } else if (typeof val === "number") {
      if (Number.isInteger(val)) {
        req.input(pName, sql.Int, val);
      } else {
        req.input(pName, sql.Float, val);
      }
    } else if (val instanceof Date) {
      req.input(pName, sql.DateTime2, val);
    } else {
      req.input(pName, sql.NVarChar, String(val));
    }
  }

  return { req, convertedSql };
}

// Execute query returning changes or last ID
async function run(sqlText, params = []) {
  const pool = await getPool();
  let queryText = sqlText;

  // Append SCOPE_IDENTITY() to INSERT statements if not already returning ID
  const isInsert = /^\s*INSERT\s+INTO/i.test(sqlText);
  if (isInsert && !/OUTPUT\s+INSERTED/i.test(sqlText)) {
    queryText += "; SELECT SCOPE_IDENTITY() AS lastID;";
  }

  const { req, convertedSql } = prepareRequest(pool, queryText, params);
  const result = await req.query(convertedSql);

  const lastID = result.recordset && result.recordset[0] && result.recordset[0].lastID
    ? result.recordset[0].lastID
    : null;

  return {
    lastID,
    rowsAffected: result.rowsAffected ? result.rowsAffected[0] : 0
  };
}

// Fetch single row
async function get(sqlText, params = []) {
  const pool = await getPool();
  const { req, convertedSql } = prepareRequest(pool, sqlText, params);
  const result = await req.query(convertedSql);
  return result.recordset && result.recordset.length > 0 ? result.recordset[0] : undefined;
}

// Fetch all rows
async function all(sqlText, params = []) {
  const pool = await getPool();
  const { req, convertedSql } = prepareRequest(pool, sqlText, params);
  const result = await req.query(convertedSql);
  return result.recordset || [];
}

// Transaction execution wrapper
async function transaction(callback) {
  const pool = await getPool();
  const txn = new sql.Transaction(pool);
  await txn.begin();

  try {
    const result = await callback(txn);
    await txn.commit();
    return result;
  } catch (err) {
    await txn.rollback();
    throw err;
  }
}

// Initialize Azure SQL schema from schema.azure.sql
async function initSchema() {
  const pool = await getPool();
  const schemaPath = path.join(__dirname, "schema.azure.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  // Split on batch boundaries if any, or execute directly
  const batches = schemaSql.split(/\bGO\b/i);
  for (const batch of batches) {
    const trimmed = batch.trim();
    if (trimmed.length > 0) {
      await pool.request().batch(trimmed);
    }
  }
}

module.exports = {
  validateAzureConfig,
  getPool,
  run,
  get,
  all,
  transaction,
  initSchema
};
