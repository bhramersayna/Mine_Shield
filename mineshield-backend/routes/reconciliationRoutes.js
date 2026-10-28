const express = require("express");
const router = express.Router();
const reconciliationEngine = require("../services/reconciliationEngine");
const { get } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");

// Trigger Reconciliation Run
router.post(
  "/run",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  async (req, res) => {
    try {
      let tolerance = parseFloat(req.body.quantity_tolerance_pct);
      if (isNaN(tolerance) || tolerance < 0) {
        // Fetch default setting from database
        const defaultSetting = await get("SELECT setting_value FROM Settings WHERE setting_key = 'quantity_tolerance_pct'");
        tolerance = defaultSetting ? parseFloat(defaultSetting.setting_value) : 5.0;
      }

      const result = await reconciliationEngine.runReconciliation({
        userId: req.user.id,
        quantityTolerancePct: tolerance
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// List Reconciliation Runs
router.get("/runs", authenticateToken, async (req, res) => {
  try {
    const runs = await reconciliationEngine.getRunsList(50);
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Reconciliation Run Details & Matches
router.get("/runs/:id", authenticateToken, async (req, res) => {
  try {
    const details = await reconciliationEngine.getRunDetails(req.params.id);
    if (!details) return res.status(404).json({ error: "Reconciliation run not found" });
    res.json(details);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
