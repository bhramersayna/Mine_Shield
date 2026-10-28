const express = require("express");
const router = express.Router();
const { run, get, all, transaction } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const auditService = require("../services/auditService");

const VALID_CASE_STATUSES = ["OPEN", "IN_INVESTIGATION", "AWAITING_INFORMATION", "ESCALATED", "RESOLVED", "CLOSED"];
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// List Compliance Cases
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { status, priority, search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT cc.*, 
        u_assign.full_name as assigned_to_name,
        u_create.full_name as created_by_name,
        (SELECT COUNT(*) FROM CaseDiscrepancies cd WHERE cd.case_id = cc.id) as linked_discrepancies_count
      FROM ComplianceCases cc
      LEFT JOIN Users u_assign ON cc.assigned_to = u_assign.id
      LEFT JOIN Users u_create ON cc.created_by = u_create.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ` AND cc.status = ? `;
      params.push(status);
    }
    if (priority) {
      query += ` AND cc.priority = ? `;
      params.push(priority);
    }
    if (search) {
      query += ` AND (cc.case_code LIKE ? OR cc.title LIKE ? OR cc.description LIKE ?) `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY cc.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const cases = await all(query, params);
    const countRow = await get("SELECT COUNT(*) as count FROM ComplianceCases");

    res.json({ total: countRow.count, cases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Compliance Case
router.post(
  "/",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  async (req, res) => {
    try {
      const { title, description, priority = "MEDIUM", assigned_to, discrepancy_ids = [] } = req.body;

      if (!title || title.trim().length === 0) {
        return res.status(400).json({ error: "Case title is required." });
      }
      if (!description || description.trim().length === 0) {
        return res.status(400).json({ error: "Case description is required." });
      }
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority '${priority}'. Must be one of [${VALID_PRIORITIES.join(", ")}]` });
      }

      const caseCode = `CASE-${Date.now().toString().slice(-6)}`;

      const createdCase = await transaction(async () => {
        const caseRes = await run(
          `INSERT INTO ComplianceCases (case_code, title, description, priority, status, assigned_to, created_by)
           VALUES (?, ?, ?, ?, 'OPEN', ?, ?)`,
          [caseCode, title.trim(), description.trim(), priority, assigned_to || null, req.user.id]
        );
        const caseId = caseRes.lastID;

        // Link discrepancies if provided
        if (Array.isArray(discrepancy_ids)) {
          for (const discId of discrepancy_ids) {
            await run(
              `INSERT OR IGNORE INTO CaseDiscrepancies (case_id, discrepancy_id) VALUES (?, ?)`,
              [caseId, discId]
            );
            // Optionally update discrepancy status to UNDER_REVIEW
            await run(
              `UPDATE Discrepancies SET status = 'UNDER_REVIEW', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'NEW'`,
              [discId]
            );
          }
        }

        await auditService.log({
          actorId: req.user.id,
          actorUsername: req.user.username,
          action: "CREATE_CASE",
          resourceType: "ComplianceCases",
          resourceId: caseId,
          metadata: { caseCode, title, linkedDiscrepancies: discrepancy_ids.length }
        });

        return await get("SELECT * FROM ComplianceCases WHERE id = ?", [caseId]);
      });

      res.status(201).json(createdCase);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Get Case Detail with Linked Discrepancies and Evidence
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const caseRecord = await get(`
      SELECT cc.*, 
        u_assign.full_name as assigned_to_name, u_assign.email as assigned_to_email,
        u_create.full_name as created_by_name
      FROM ComplianceCases cc
      LEFT JOIN Users u_assign ON cc.assigned_to = u_assign.id
      LEFT JOIN Users u_create ON cc.created_by = u_create.id
      WHERE cc.id = ?
    `, [req.params.id]);

    if (!caseRecord) {
      return res.status(404).json({ error: "Compliance case not found" });
    }

    const linkedDiscrepancies = await all(`
      SELECT d.*, 
        pr.source_permit_no, pr.vehicle_no as permit_vehicle, pr.authorized_quantity,
        cp.checkpoint_name, cp.vehicle_no as checkpoint_vehicle,
        wb.weighbridge_id, wb.vehicle_no as weighbridge_vehicle, wb.net_weight
      FROM CaseDiscrepancies cd
      JOIN Discrepancies d ON cd.discrepancy_id = d.id
      LEFT JOIN PermitRecords pr ON d.permit_id = pr.id
      LEFT JOIN CheckpointRecords cp ON d.checkpoint_id = cp.id
      LEFT JOIN WeighbridgeRecords wb ON d.weighbridge_id = wb.id
      WHERE cd.case_id = ?
    `, [caseRecord.id]);

    const linkedEvidence = await all(`
      SELECT e.*, u.full_name as uploader_name
      FROM Evidence e
      LEFT JOIN Users u ON e.uploaded_by = u.id
      WHERE e.case_id = ?
      ORDER BY e.id DESC
    `, [caseRecord.id]);

    res.json({
      caseRecord,
      discrepancies: linkedDiscrepancies,
      evidence: linkedEvidence
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Case Status or Decision
router.patch(
  "/:id",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  async (req, res) => {
    try {
      const { status, priority, assigned_to, decision_summary } = req.body;
      const caseId = req.params.id;

      const existing = await get("SELECT * FROM ComplianceCases WHERE id = ?", [caseId]);
      if (!existing) {
        return res.status(404).json({ error: "Compliance case not found" });
      }

      if (status && !VALID_CASE_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status '${status}'. Must be one of [${VALID_CASE_STATUSES.join(", ")}]` });
      }
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `Invalid priority '${priority}'. Must be one of [${VALID_PRIORITIES.join(", ")}]` });
      }

      // Mandatory decision explanation when closing or resolving
      if (["RESOLVED", "CLOSED"].includes(status) && (!decision_summary || decision_summary.trim().length < 5)) {
        return res.status(400).json({
          error: "A documented decision summary (at least 5 characters) is required when marking a compliance case as Resolved or Closed."
        });
      }

      let updateSql = "UPDATE ComplianceCases SET updated_at = CURRENT_TIMESTAMP";
      const updateParams = [];

      if (status) {
        updateSql += ", status = ?";
        updateParams.push(status);
        if (["RESOLVED", "CLOSED"].includes(status)) {
          updateSql += ", decision_summary = ?, resolved_at = CURRENT_TIMESTAMP";
          updateParams.push(decision_summary.trim());
        }
      }

      if (priority) {
        updateSql += ", priority = ?";
        updateParams.push(priority);
      }

      if (assigned_to !== undefined) {
        updateSql += ", assigned_to = ?";
        updateParams.push(assigned_to || null);
      }

      updateSql += " WHERE id = ?";
      updateParams.push(caseId);

      await run(updateSql, updateParams);

      await auditService.log({
        actorId: req.user.id,
        actorUsername: req.user.username,
        action: "UPDATE_CASE",
        resourceType: "ComplianceCases",
        resourceId: caseId,
        metadata: { previousStatus: existing.status, newStatus: status || existing.status }
      });

      const updated = await get("SELECT * FROM ComplianceCases WHERE id = ?", [caseId]);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
