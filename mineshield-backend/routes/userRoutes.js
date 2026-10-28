const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const { all, get, run } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const auditService = require("../services/auditService");

// List all users
router.get("/", authenticateToken, requireRole("Administrator"), async (req, res) => {
  try {
    const users = await all(
      "SELECT id, username, full_name, email, role, created_at FROM Users ORDER BY id ASC"
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new user (Admin only)
router.post("/", authenticateToken, requireRole("Administrator"), async (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;

    if (!username || !password || !full_name || !email || !role) {
      return res.status(400).json({ error: "All fields (username, password, full_name, email, role) are required." });
    }

    if (!["Administrator", "ComplianceReviewer", "ReadOnlyAuditor"].includes(role)) {
      return res.status(400).json({ error: "Role must be Administrator, ComplianceReviewer, or ReadOnlyAuditor." });
    }

    const existing = await get("SELECT id FROM Users WHERE username = ? OR email = ?", [username.trim(), email.trim()]);
    if (existing) {
      return res.status(409).json({ error: "A user with this username or email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await run(
      `INSERT INTO Users (username, password_hash, full_name, email, role) VALUES (?, ?, ?, ?, ?)`,
      [username.trim(), passwordHash, full_name.trim(), email.trim(), role]
    );

    await auditService.log({
      actorId: req.user.id,
      actorUsername: req.user.username,
      action: "CREATE_USER",
      resourceType: "Users",
      resourceId: insertRes.lastID,
      metadata: { username, role }
    });

    res.status(201).json({
      id: insertRes.lastID,
      username,
      full_name,
      email,
      role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
