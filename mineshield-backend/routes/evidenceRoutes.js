const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const storageService = require("../services/storageService");
const { run, get, all } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const auditService = require("../services/auditService");
const { validateFileContent } = require("../utils/fileValidation");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".csv", ".txt", ".xlsx"];

// Upload Evidence File
router.post(
  "/",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No evidence file uploaded." });
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return res.status(400).json({
          error: `Unsupported file type '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(", ")}`
        });
      }

      // Validate actual file content (magic bytes & structure) against claimed extension
      const contentValidation = validateFileContent(req.file.buffer, ext);
      if (!contentValidation.isValid) {
        return res.status(400).json({
          error: `File content verification failed: ${contentValidation.error}`
        });
      }

      const { description, discrepancy_id, case_id } = req.body;

      // Save file through storage service
      const saved = await storageService.saveFile(req.file.buffer, req.file.originalname, req.file.mimetype);

      const evidenceRes = await run(
        `INSERT INTO Evidence (original_filename, stored_filename, file_type, file_size, sha256_hash, description, discrepancy_id, case_id, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.file.originalname,
          saved.storedFilename,
          ext.replace(".", "").toUpperCase(),
          saved.size,
          saved.hash,
          description ? description.trim() : null,
          discrepancy_id ? parseInt(discrepancy_id, 10) : null,
          case_id ? parseInt(case_id, 10) : null,
          req.user.id
        ]
      );

      await auditService.log({
        actorId: req.user.id,
        actorUsername: req.user.username,
        action: "UPLOAD_EVIDENCE",
        resourceType: "Evidence",
        resourceId: evidenceRes.lastID,
        metadata: { filename: req.file.originalname, size: saved.size, sha256: saved.hash }
      });

      const created = await get("SELECT * FROM Evidence WHERE id = ?", [evidenceRes.lastID]);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List Evidence Items
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { discrepancy_id, case_id, limit = 50 } = req.query;
    let query = `
      SELECT e.*, u.full_name as uploader_name
      FROM Evidence e
      LEFT JOIN Users u ON e.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (discrepancy_id) {
      query += ` AND e.discrepancy_id = ? `;
      params.push(discrepancy_id);
    }
    if (case_id) {
      query += ` AND e.case_id = ? `;
      params.push(case_id);
    }

    query += ` ORDER BY e.id DESC LIMIT ? `;
    params.push(parseInt(limit, 10));

    const evidenceList = await all(query, params);
    res.json(evidenceList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download Evidence File
router.get("/:id/download", authenticateToken, async (req, res) => {
  try {
    const evidence = await get("SELECT * FROM Evidence WHERE id = ?", [req.params.id]);
    if (!evidence) {
      return res.status(404).json({ error: "Evidence item not found." });
    }

    await auditService.log({
      actorId: req.user.id,
      actorUsername: req.user.username,
      action: "DOWNLOAD_EVIDENCE",
      resourceType: "Evidence",
      resourceId: evidence.id,
      metadata: { filename: evidence.original_filename }
    });

    if (storageService.provider === "azureblob") {
      const buffer = await storageService.getFileBuffer(evidence.stored_filename);
      res.setHeader("Content-Disposition", `attachment; filename="${evidence.original_filename}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      return res.send(buffer);
    }

    const filePath = storageService.getFilePath(evidence.stored_filename);
    res.download(filePath, evidence.original_filename);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Verify Evidence SHA-256 Hash Integrity
router.get("/:id/verify", authenticateToken, async (req, res) => {
  try {
    const evidence = await get("SELECT * FROM Evidence WHERE id = ?", [req.params.id]);
    if (!evidence) {
      return res.status(404).json({ error: "Evidence item not found." });
    }

    const fileBuffer = await storageService.getFileBuffer(evidence.stored_filename);
    const recalculatedHash = storageService.calculateHash(fileBuffer);
    const isIntegrityIntact = recalculatedHash.toLowerCase() === (evidence.sha256_hash || "").toLowerCase();

    await auditService.log({
      actorId: req.user.id,
      actorUsername: req.user.username,
      action: "VERIFY_EVIDENCE_INTEGRITY",
      resourceType: "Evidence",
      resourceId: evidence.id,
      metadata: {
        filename: evidence.original_filename,
        storedHash: evidence.sha256_hash,
        recalculatedHash,
        integrityIntact: isIntegrityIntact
      },
      outcome: isIntegrityIntact ? "SUCCESS" : "FAILURE"
    });

    res.json({
      evidenceId: evidence.id,
      originalFilename: evidence.original_filename,
      storedHash: evidence.sha256_hash,
      recalculatedHash,
      integrityVerified: isIntegrityIntact,
      status: isIntegrityIntact ? "VERIFIED_AUTHENTIC" : "HASH_MISMATCH_TAMPERED",
      verifiedAt: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
