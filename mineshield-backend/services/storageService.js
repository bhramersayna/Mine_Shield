const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

// Ensure local storage directory exists if using local provider
if (config.storageProvider === "local" && !fs.existsSync(config.localStorageDir)) {
  fs.mkdirSync(config.localStorageDir, { recursive: true });
}

class StorageService {
  constructor() {
    this.provider = config.storageProvider;
    this.localDir = config.localStorageDir;
    this._blobServiceClient = null;
    this._containerClient = null;
  }

  // Calculate SHA-256 hash of a buffer
  calculateHash(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  // Generate safe storage filename with path-traversal protection and random entropy
  generateSafeFilename(originalFilename) {
    const ext = path.extname(originalFilename).toLowerCase();
    const safeBase = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueToken = crypto.randomBytes(8).toString("hex");
    return `${Date.now()}-${uniqueToken}-${safeBase}${ext}`;
  }

  // Get Azure Container Client with fail-fast validation
  getAzureContainerClient() {
    if (this._containerClient) return this._containerClient;

    if (!config.azureBlob.connectionString || config.azureBlob.connectionString.trim() === "") {
      throw new Error(
        "Misconfigured Cloud Storage: STORAGE_PROVIDER is set to 'azureblob', but AZURE_STORAGE_CONNECTION_STRING is missing or empty.\n" +
        "Please provide AZURE_STORAGE_CONNECTION_STRING and AZURE_STORAGE_CONTAINER in your environment.\n" +
        "To run locally without Azure credentials, set STORAGE_PROVIDER=local."
      );
    }

    const { BlobServiceClient } = require("@azure/storage-blob");
    this._blobServiceClient = BlobServiceClient.fromConnectionString(config.azureBlob.connectionString);
    this._containerClient = this._blobServiceClient.getContainerClient(config.azureBlob.containerName);
    return this._containerClient;
  }

  // Save file buffer to configured storage adapter
  async saveFile(fileBuffer, originalFilename, mimeType = "application/octet-stream") {
    const storedFilename = this.generateSafeFilename(originalFilename);
    const hash = this.calculateHash(fileBuffer);
    const size = fileBuffer.length;

    if (this.provider === "azureblob") {
      const containerClient = this.getAzureContainerClient();
      await containerClient.createIfNotExists();
      const blockBlobClient = containerClient.getBlockBlobClient(storedFilename);
      await blockBlobClient.uploadData(fileBuffer, {
        blobHTTPHeaders: { blobContentType: mimeType }
      });

      return {
        storedFilename,
        hash,
        size,
        provider: "azureblob",
        url: blockBlobClient.url
      };
    }

    // Default Local Storage Adapter
    const safeName = path.basename(storedFilename);
    const targetPath = path.join(this.localDir, safeName);
    await fs.promises.writeFile(targetPath, fileBuffer);

    return {
      storedFilename: safeName,
      hash,
      size,
      provider: "local",
      localPath: targetPath
    };
  }

  // Retrieve file buffer for download, hash recalculation, and integrity verification
  async getFileBuffer(storedFilename) {
    const safeName = path.basename(storedFilename);

    if (this.provider === "azureblob") {
      const containerClient = this.getAzureContainerClient();
      const blockBlobClient = containerClient.getBlockBlobClient(safeName);
      const exists = await blockBlobClient.exists();
      if (!exists) {
        throw new Error(`Blob '${safeName}' not found in Azure Storage container '${config.azureBlob.containerName}'`);
      }
      return await blockBlobClient.downloadToBuffer();
    }

    const safePath = path.join(this.localDir, safeName);
    if (!fs.existsSync(safePath)) {
      throw new Error(`File '${safeName}' not found in local storage`);
    }
    return await fs.promises.readFile(safePath);
  }

  // Get local file path (for local provider streaming)
  getFilePath(storedFilename) {
    const safeName = path.basename(storedFilename);
    const safePath = path.join(this.localDir, safeName);
    if (!fs.existsSync(safePath)) {
      throw new Error(`File '${safeName}' not found in local storage`);
    }
    return safePath;
  }
}

module.exports = new StorageService();
