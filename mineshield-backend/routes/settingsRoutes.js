const express = require("express");
const router = express.Router();
const { all, get, run } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const auditService = require("../services/auditService");

// List all settings
router.get("/", authenticateToken, async (req, res) => {
  try {
    const settings = await all("SELECT * FROM Settings ORDER BY id ASC");
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a setting (Admin only)
router.patch("/:key", authenticateToken, requireRole("Administrator"), async (req, res) => {
  try {
    const { setting_value } = req.body;
    if (setting_value === undefined) {
      return res.status(400).json({ error: "setting_value is required." });
    }

    const key = req.params.key;
    const existing = await get("SELECT * FROM Settings WHERE setting_key = ?", [key]);
    if (!existing) {
      return res.status(404).json({ error: `Setting '${key}' not found.` });
    }

    await run(
      "UPDATE Settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = ?",
      [String(setting_value), key]
    );

    await auditService.log({
      actorId: req.user.id,
      actorUsername: req.user.username,
      action: "UPDATE_SETTING",
      resourceType: "Settings",
      resourceId: key,
      metadata: { previousValue: existing.setting_value, newValue: setting_value }
    });

    const updated = await get("SELECT * FROM Settings WHERE setting_key = ?", [key]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
