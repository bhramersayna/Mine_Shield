const express = require("express");
const router = express.Router();
const multer = require("multer");
const importService = require("../services/importService");
const { get } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { buildCsvString } = require("../utils/csvSanitizer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Preview CSV upload before committing import
router.post(
  "/preview",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  upload.single("file"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded." });
      }

      const sourceType = (req.body.source_type || "").toUpperCase();
      if (!["PERMIT", "CHECKPOINT", "WEIGHBRIDGE"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid source_type. Must be PERMIT, CHECKPOINT, or WEIGHBRIDGE." });
      }

      let customMapping = {};
      if (req.body.custom_mapping) {
        try {
          customMapping = typeof req.body.custom_mapping === "string" ? JSON.parse(req.body.custom_mapping) : req.body.custom_mapping;
        } catch (e) {
          // ignore parsing error
        }
      }

      const preview = importService.previewCsv(req.file.buffer, sourceType, customMapping);
      res.json(preview);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Execute import and save to normalized tables
router.post(
  "/",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file provided for import." });
      }

      const sourceType = (req.body.source_type || "").toUpperCase();
      if (!["PERMIT", "CHECKPOINT", "WEIGHBRIDGE"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid source_type. Must be PERMIT, CHECKPOINT, or WEIGHBRIDGE." });
      }

      let customMapping = {};
      if (req.body.custom_mapping) {
        try {
          customMapping = typeof req.body.custom_mapping === "string" ? JSON.parse(req.body.custom_mapping) : req.body.custom_mapping;
        } catch (e) {
          // ignore
        }
      }

      const result = await importService.executeImport({
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        sourceType,
        userId: req.user.id,
        customMapping
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// List past imports
router.get("/", authenticateToken, async (req, res) => {
  try {
    const imports = await importService.getImportsList(50);
    res.json(imports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single import metadata
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const importRecord = await get("SELECT * FROM DataImports WHERE id = ?", [req.params.id]);
    if (!importRecord) return res.status(404).json({ error: "Import not found" });
    res.json(importRecord);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get row validation errors for an import
router.get("/:id/errors", authenticateToken, async (req, res) => {
  try {
    const errors = await importService.getImportErrors(req.params.id);
    res.json(errors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export rejected rows as CSV
router.get("/:id/errors/csv", authenticateToken, async (req, res) => {
  try {
    const errors = await importService.getImportErrors(req.params.id);
    if (errors.length === 0) {
      return res.status(404).json({ error: "No error rows found for this import." });
    }

    const headers = ["RowNumber", "ErrorMessage", "RawData"];
    const csvContent = buildCsvString(headers, errors, (err) => [
      err.row_number,
      err.error_message,
      err.raw_row_json
    ]);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=import_${req.params.id}_errors.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
