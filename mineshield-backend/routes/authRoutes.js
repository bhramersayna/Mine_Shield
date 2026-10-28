const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { get } = require("../db");
const config = require("../config");
const { authenticateToken } = require("../middleware/auth");
const auditService = require("../services/auditService");
const { loginRateLimiter } = require("../middleware/rateLimiter");

// Login
router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const user = await get("SELECT * FROM Users WHERE username = ?", [username.trim()]);
    if (!user) {
      await auditService.log({
        actorUsername: username,
        action: "LOGIN_FAILED",
        resourceType: "Users",
        outcome: "FAILURE",
        metadata: { reason: "User not found" }
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await auditService.log({
        actorId: user.id,
        actorUsername: user.username,
        action: "LOGIN_FAILED",
        resourceType: "Users",
        resourceId: user.id,
        outcome: "FAILURE",
        metadata: { reason: "Invalid password" }
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, full_name: user.full_name, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    await auditService.log({
      actorId: user.id,
      actorUsername: user.username,
      action: "LOGIN_SUCCESS",
      resourceType: "Users",
      resourceId: user.id
    });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User Info
router.get("/me", authenticateToken, (req, res) => {
  res.json(req.user);
});

module.exports = router;
