const express = require("express");
const router = express.Router();
const { run, get, all, transaction } = require("../db");
const { authenticateToken, requireRole } = require("../middleware/auth");
const auditService = require("../services/auditService");

// Valid status lifecycle transitions
const VALID_STATUSES = ["NEW", "UNDER_REVIEW", "AWAITING_EVIDENCE", "ESCALATED", "RESOLVED", "DISMISSED"];

// List Discrepancies with filtering and search
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { category, severity, status, search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT d.*, 
        pr.source_permit_no, pr.vehicle_no as permit_vehicle, pr.authorized_quantity,
        cp.checkpoint_name, cp.vehicle_no as checkpoint_vehicle,
        wb.weighbridge_id, wb.vehicle_no as weighbridge_vehicle, wb.net_weight,
        u.full_name as assigned_to_name
      FROM Discrepancies d
      LEFT JOIN PermitRecords pr ON d.permit_id = pr.id
      LEFT JOIN CheckpointRecords cp ON d.checkpoint_id = cp.id
      LEFT JOIN WeighbridgeRecords wb ON d.weighbridge_id = wb.id
      LEFT JOIN Users u ON d.assigned_to = u.id
      WHERE 1=1
    `;
    const params = [];

    if (category) {
      query += ` AND d.category = ? `;
      params.push(category);
    }
    if (severity) {
      query += ` AND d.severity = ? `;
      params.push(severity);
    }
    if (status) {
      query += ` AND d.status = ? `;
      params.push(status);
    }
    if (search) {
      query += ` AND (d.discrepancy_code LIKE ? OR d.title LIKE ? OR pr.source_permit_no LIKE ? OR pr.vehicle_no LIKE ?) `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY d.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const records = await all(query, params);
    const countRow = await get("SELECT COUNT(*) as count FROM Discrepancies");

    res.json({ total: countRow.count, discrepancies: records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Discrepancy Detail with Field-by-Field Source Comparison
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const discrepancy = await get(`
      SELECT d.*, 
        u.full_name as assigned_to_name, u.email as assigned_to_email,
        rr.run_code, rr.started_at as run_timestamp
      FROM Discrepancies d
      LEFT JOIN Users u ON d.assigned_to = u.id
      LEFT JOIN ReconciliationRuns rr ON d.run_id = rr.id
      WHERE d.id = ?
    `, [req.params.id]);

    if (!discrepancy) {
      return res.status(404).json({ error: "Discrepancy record not found" });
    }

    // Fetch supporting source records
    let permit = null;
    let checkpoint = null;
    let weighbridge = null;

    if (discrepancy.permit_id) {
      permit = await get("SELECT * FROM PermitRecords WHERE id = ?", [discrepancy.permit_id]);
    }
    if (discrepancy.checkpoint_id) {
      checkpoint = await get("SELECT * FROM CheckpointRecords WHERE id = ?", [discrepancy.checkpoint_id]);
    }
    if (discrepancy.weighbridge_id) {
      weighbridge = await get("SELECT * FROM WeighbridgeRecords WHERE id = ?", [discrepancy.weighbridge_id]);
    }

    // Fetch investigation notes
    const notes = await all(`
      SELECT dn.*, u.full_name as author_name, u.role as author_role
      FROM DiscrepancyNotes dn
      LEFT JOIN Users u ON dn.author_id = u.id
      WHERE dn.discrepancy_id = ?
      ORDER BY dn.id ASC
    `, [discrepancy.id]);

    // Fetch linked evidence
    const evidence = await all(`
      SELECT e.*, u.full_name as uploader_name
      FROM Evidence e
      LEFT JOIN Users u ON e.uploaded_by = u.id
      WHERE e.discrepancy_id = ?
      ORDER BY e.id DESC
    `, [discrepancy.id]);

    // Fetch linked cases
    const linkedCases = await all(`
      SELECT cc.id, cc.case_code, cc.title, cc.status, cc.priority
      FROM CaseDiscrepancies cd
      JOIN ComplianceCases cc ON cd.case_id = cc.id
      WHERE cd.discrepancy_id = ?
    `, [discrepancy.id]);

    res.json({
      discrepancy,
      sources: {
        permit,
        checkpoint,
        weighbridge
      },
      notes,
      evidence,
      linkedCases
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Discrepancy Status or Assignee
router.patch(
  "/:id",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  async (req, res) => {
    try {
      const { status, assigned_to, resolution_summary, note_text } = req.body;
      const discrepancyId = req.params.id;

      const existing = await get("SELECT * FROM Discrepancies WHERE id = ?", [discrepancyId]);
      if (!existing) {
        return res.status(404).json({ error: "Discrepancy record not found" });
      }

      if (status && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status '${status}'. Must be one of [${VALID_STATUSES.join(", ")}]` });
      }

      // Mandatory resolution explanation if resolving or dismissing
      if (["RESOLVED", "DISMISSED"].includes(status) && (!resolution_summary || resolution_summary.trim().length < 5)) {
        return res.status(400).json({
          error: "A documented resolution summary (at least 5 characters) is required when marking a discrepancy as Resolved or Dismissed."
        });
      }

      await transaction(async () => {
        let updateSql = "UPDATE Discrepancies SET updated_at = CURRENT_TIMESTAMP";
        const updateParams = [];

        if (status) {
          updateSql += ", status = ?";
          updateParams.push(status);
          if (["RESOLVED", "DISMISSED"].includes(status)) {
            updateSql += ", resolution_summary = ?, resolved_at = CURRENT_TIMESTAMP";
            updateParams.push(resolution_summary.trim());
          }
        }

        if (assigned_to !== undefined) {
          updateSql += ", assigned_to = ?";
          updateParams.push(assigned_to || null);
        }

        updateSql += " WHERE id = ?";
        updateParams.push(discrepancyId);

        await run(updateSql, updateParams);

        // Add note if provided or status changed
        if (note_text || (status && status !== existing.status)) {
          const text = note_text || `Status changed from ${existing.status} to ${status}. ${resolution_summary ? "Summary: " + resolution_summary : ""}`;
          await run(
            `INSERT INTO DiscrepancyNotes (discrepancy_id, author_id, note_text, status_change)
             VALUES (?, ?, ?, ?)`,
            [discrepancyId, req.user.id, text.trim(), status ? `${existing.status} -> ${status}` : null]
          );
        }

        // Audit log
        await auditService.log({
          actorId: req.user.id,
          actorUsername: req.user.username,
          action: "UPDATE_DISCREPANCY",
          resourceType: "Discrepancies",
          resourceId: discrepancyId,
          metadata: { previousStatus: existing.status, newStatus: status || existing.status, assignedTo: assigned_to }
        });
      });

      const updated = await get("SELECT * FROM Discrepancies WHERE id = ?", [discrepancyId]);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Add Investigation Note
router.post(
  "/:id/notes",
  authenticateToken,
  requireRole("Administrator", "ComplianceReviewer"),
  async (req, res) => {
    try {
      const { note_text } = req.body;
      if (!note_text || note_text.trim().length === 0) {
        return res.status(400).json({ error: "Note text is required." });
      }

      const discrepancyId = req.params.id;
      const existing = await get("SELECT id FROM Discrepancies WHERE id = ?", [discrepancyId]);
      if (!existing) {
        return res.status(404).json({ error: "Discrepancy record not found" });
      }

      const noteRes = await run(
        `INSERT INTO DiscrepancyNotes (discrepancy_id, author_id, note_text)
         VALUES (?, ?, ?)`,
        [discrepancyId, req.user.id, note_text.trim()]
      );

      await auditService.log({
        actorId: req.user.id,
        actorUsername: req.user.username,
        action: "ADD_DISCREPANCY_NOTE",
        resourceType: "Discrepancies",
        resourceId: discrepancyId
      });

      res.status(201).json({ message: "Note added successfully", noteId: noteRes.lastID });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
