const express = require("express");
const router = express.Router();
const { all, get } = require("../db");
const { authenticateToken } = require("../middleware/auth");

// List Permit Records
router.get("/permits", authenticateToken, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT pr.*, di.file_name as import_file_name
      FROM PermitRecords pr
      LEFT JOIN DataImports di ON pr.import_id = di.id
    `;
    const params = [];

    if (search) {
      query += ` WHERE pr.source_permit_no LIKE ? OR pr.vehicle_no LIKE ? OR pr.mineral_type LIKE ? `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += ` ORDER BY pr.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const records = await all(query, params);
    const countRow = await get("SELECT COUNT(*) as count FROM PermitRecords");

    res.json({ total: countRow.count, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Checkpoint Records
router.get("/checkpoints", authenticateToken, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT cr.*, di.file_name as import_file_name
      FROM CheckpointRecords cr
      LEFT JOIN DataImports di ON cr.import_id = di.id
    `;
    const params = [];

    if (search) {
      query += ` WHERE cr.source_event_id LIKE ? OR cr.permit_no LIKE ? OR cr.vehicle_no LIKE ? OR cr.checkpoint_name LIKE ? `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY cr.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const records = await all(query, params);
    const countRow = await get("SELECT COUNT(*) as count FROM CheckpointRecords");

    res.json({ total: countRow.count, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List Weighbridge Records
router.get("/weighbridges", authenticateToken, async (req, res) => {
  try {
    const { search, limit = 50, offset = 0 } = req.query;
    let query = `
      SELECT wr.*, di.file_name as import_file_name
      FROM WeighbridgeRecords wr
      LEFT JOIN DataImports di ON wr.import_id = di.id
    `;
    const params = [];

    if (search) {
      query += ` WHERE wr.source_transaction_id LIKE ? OR wr.permit_no LIKE ? OR wr.vehicle_no LIKE ? OR wr.weighbridge_id LIKE ? `;
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY wr.id DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const records = await all(query, params);
    const countRow = await get("SELECT COUNT(*) as count FROM WeighbridgeRecords");

    res.json({ total: countRow.count, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
