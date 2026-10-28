const express = require("express");
const router = express.Router();
const auditService = require("../services/auditService");
const { authenticateToken, requireRole } = require("../middleware/auth");

// List Audit Logs
router.get(
  "/",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer", "ReadOnlyAuditor"),
  async (req, res) => {
    try {
      const { limit = 100, action } = req.query;
      const logs = await auditService.getRecentLogs(parseInt(limit, 10), action || null);
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
