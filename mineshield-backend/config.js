require("dotenv").config();
const path = require("path");

module.exports = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,
  jwtSecret: process.env.JWT_SECRET || "mineshield-reconciliation-jwt-secret-key-2026",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",

  // Database Configuration: 'sqlite' (local development) or 'azuresql' (cloud)
  databaseProvider: process.env.DATABASE_PROVIDER || "sqlite",
  sqlitePath: process.env.SQLITE_PATH || path.join(__dirname, "mineshield.db"),

  // Azure SQL Database Configuration (Required when DATABASE_PROVIDER=azuresql)
  azureSql: {
    server: process.env.AZURE_SQL_SERVER || "",
    database: process.env.AZURE_SQL_DATABASE || "",
    user: process.env.AZURE_SQL_USER || "",
    password: process.env.AZURE_SQL_PASSWORD || "",
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  },

  // Storage Configuration: 'local' (local disk storage) or 'azureblob' (cloud)
  storageProvider: process.env.STORAGE_PROVIDER || "local",
  localStorageDir: process.env.LOCAL_STORAGE_DIR || path.join(__dirname, "uploads"),

  // Azure Blob Storage Configuration (Required when STORAGE_PROVIDER=azureblob)
  azureBlob: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || "",
    containerName: process.env.AZURE_STORAGE_CONTAINER || "mineshield-evidence"
  },

  // Reconciliation Default Parameters
  reconciliationDefaults: {
    quantityTolerancePct: 5.0, // 5% variance threshold before flagging
    timeWindowHours: 24
  }
};
