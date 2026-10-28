const { run, all } = require("../db");

class AuditService {
  async log({ actorId = null, actorUsername = "anonymous", action, resourceType, resourceId = null, metadata = null, outcome = "SUCCESS" }) {
    try {
      const metaString = metadata ? (typeof metadata === "string" ? metadata : JSON.stringify(metadata)) : null;
      await run(
        `INSERT INTO AuditLogs (actor_id, actor_username, action, resource_type, resource_id, metadata_json, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [actorId, actorUsername, action, resourceType, String(resourceId || ""), metaString, outcome]
      );
    } catch (err) {
      console.error("Failed to write audit log:", err);
    }
  }

  async getRecentLogs(limit = 100, filterAction = null) {
    if (filterAction) {
      return await all(
        `SELECT * FROM AuditLogs WHERE action = ? ORDER BY id DESC LIMIT ?`,
        [filterAction, limit]
      );
    }
    return await all(
      `SELECT * FROM AuditLogs ORDER BY id DESC LIMIT ?`,
      [limit]
    );
  }
}

module.exports = new AuditService();
