const jwt = require("jsonwebtoken");
const config = require("../config");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required: access token missing." });
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Access token is invalid or has expired." });
    }
    req.user = user;
    next();
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access Denied: Action requires one of [${allowedRoles.join(", ")}]. Current role: '${req.user.role}'.`
      });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole
};
