const express = require("express");
const router = express.Router();
const { get, all } = require("../db");
const { authenticateToken } = require("../middleware/auth");
const auditService = require("../services/auditService");
const { buildCsvString } = require("../utils/csvSanitizer");

// Comprehensive Overview Metrics
router.get("/overview", authenticateToken, async (req, res) => {
  try {
    const [
      permitsCount,
      checkpointsCount,
      weighbridgesCount,
      reconciliationRunsCount,
      matchesStats,
      discrepanciesStats,
      casesStats,
      tonnageStats
    ] = await Promise.all([
      get("SELECT COUNT(*) as count FROM PermitRecords"),
      get("SELECT COUNT(*) as count FROM CheckpointRecords"),
      get("SELECT COUNT(*) as count FROM WeighbridgeRecords"),
      get("SELECT COUNT(*) as count FROM ReconciliationRuns"),
      get(`
        SELECT 
          COUNT(*) as totalMatches,
          SUM(CASE WHEN match_type = 'EXACT' THEN 1 ELSE 0 END) as exactMatches,
          SUM(CASE WHEN match_type = 'PROBABLE' THEN 1 ELSE 0 END) as probableMatches,
          SUM(CASE WHEN match_type = 'AMBIGUOUS' THEN 1 ELSE 0 END) as ambiguousMatches,
          SUM(CASE WHEN match_type = 'UNMATCHED' THEN 1 ELSE 0 END) as unmatchedRecords
        FROM ReconciliationMatches
      `),
      get(`
        SELECT 
          COUNT(*) as totalDiscrepancies,
          SUM(CASE WHEN status IN ('NEW', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'ESCALATED') THEN 1 ELSE 0 END) as openDiscrepancies,
          SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') AND status NOT IN ('RESOLVED', 'DISMISSED') THEN 1 ELSE 0 END) as highPriorityDiscrepancies,
          SUM(CASE WHEN status IN ('RESOLVED', 'DISMISSED') THEN 1 ELSE 0 END) as resolvedDiscrepancies
        FROM Discrepancies
      `),
      get(`
        SELECT 
          COUNT(*) as totalCases,
          SUM(CASE WHEN status IN ('OPEN', 'IN_INVESTIGATION', 'AWAITING_INFORMATION', 'ESCALATED') THEN 1 ELSE 0 END) as openCases,
          SUM(CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as resolvedCases
        FROM ComplianceCases
      `),
      get(`
        SELECT 
          (SELECT COALESCE(SUM(authorized_quantity), 0) FROM PermitRecords) as totalAuthorizedTons,
          (SELECT COALESCE(SUM(net_weight), 0) FROM WeighbridgeRecords) as totalWeighedTons
      `)
    ]);

    const totalPermits = permitsCount ? permitsCount.count : 0;
    const totalMatched = (matchesStats ? (matchesStats.exactMatches || 0) + (matchesStats.probableMatches || 0) : 0);
    const matchRate = totalPermits > 0 ? Number(((totalMatched / totalPermits) * 100).toFixed(1)) : 0;

    res.json({
      totalPermitRecords: totalPermits,
      totalCheckpointRecords: checkpointsCount ? checkpointsCount.count : 0,
      totalWeighbridgeRecords: weighbridgesCount ? weighbridgesCount.count : 0,
      totalReconciliationRuns: reconciliationRunsCount ? reconciliationRunsCount.count : 0,
      successfullyMatchedRecords: totalMatched,
      recordsRequiringReview: matchesStats ? (matchesStats.ambiguousMatches || 0) + (matchesStats.unmatchedRecords || 0) : 0,
      matchRatePct: matchRate,
      openDiscrepancies: discrepanciesStats ? discrepanciesStats.openDiscrepancies || 0 : 0,
      highPriorityDiscrepancies: discrepanciesStats ? discrepanciesStats.highPriorityDiscrepancies || 0 : 0,
      totalDiscrepancies: discrepanciesStats ? discrepanciesStats.totalDiscrepancies || 0 : 0,
      resolvedDiscrepancies: discrepanciesStats ? discrepanciesStats.resolvedDiscrepancies || 0 : 0,
      openComplianceCases: casesStats ? casesStats.openCases || 0 : 0,
      resolvedComplianceCases: casesStats ? casesStats.resolvedCases || 0 : 0,
      totalAuthorizedTons: tonnageStats ? Number(tonnageStats.totalAuthorizedTons.toFixed(2)) : 0,
      totalWeighedTons: tonnageStats ? Number(tonnageStats.totalWeighedTons.toFixed(2)) : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Category and Severity Breakdown
router.get("/breakdown", authenticateToken, async (req, res) => {
  try {
    const [byCategory, bySeverity, byStatus, recentActivity] = await Promise.all([
      all(`
        SELECT category, COUNT(*) as count 
        FROM Discrepancies 
        GROUP BY category 
        ORDER BY count DESC
      `),
      all(`
        SELECT severity, COUNT(*) as count 
        FROM Discrepancies 
        GROUP BY severity 
        ORDER BY count DESC
      `),
      all(`
        SELECT status, COUNT(*) as count 
        FROM Discrepancies 
        GROUP BY status 
        ORDER BY count DESC
      `),
      all(`
        SELECT 'DISCREPANCY' as type, discrepancy_code as ref_code, title as description, status, created_at as timestamp 
        FROM Discrepancies 
        ORDER BY id DESC LIMIT 5
      `)
    ]);

    res.json({
      byCategory,
      bySeverity,
      byStatus,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export Discrepancies or Cases as CSV
router.get("/export/csv", authenticateToken, async (req, res) => {
  try {
    const type = req.query.type || "discrepancies";

    if (type === "discrepancies") {
      const rows = await all(`
        SELECT 
          d.discrepancy_code, d.category, d.severity, d.status, d.rule_id, d.title,
          pr.source_permit_no, pr.vehicle_no, d.expected_value, d.observed_value, d.variance_amount,
          u.full_name as assigned_to, d.created_at, d.resolved_at, d.resolution_summary
        FROM Discrepancies d
        LEFT JOIN PermitRecords pr ON d.permit_id = pr.id
        LEFT JOIN Users u ON d.assigned_to = u.id
        ORDER BY d.id DESC
      `);

      const headers = [
        "DiscrepancyCode", "Category", "Severity", "Status", "RuleID", "Title",
        "PermitNumber", "VehicleNumber", "ExpectedValue", "ObservedValue", "Variance",
        "AssignedTo", "DetectedAt", "ResolvedAt", "ResolutionSummary"
      ];

      const csvContent = buildCsvString(headers, rows, (r) => [
        r.discrepancy_code,
        r.category,
        r.severity,
        r.status,
        r.rule_id,
        r.title,
        r.source_permit_no,
        r.vehicle_no,
        r.expected_value,
        r.observed_value,
        r.variance_amount !== null && r.variance_amount !== undefined ? r.variance_amount : "",
        r.assigned_to,
        r.created_at,
        r.resolved_at,
        r.resolution_summary
      ]);

      await auditService.log({
        actorId: req.user.id,
        actorUsername: req.user.username,
        action: "EXPORT_REPORT",
        resourceType: "Reports",
        metadata: { type: "discrepancies_csv", rowCount: rows.length }
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=mineshield_discrepancies_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    if (type === "cases") {
      const rows = await all(`
        SELECT 
          cc.case_code, cc.title, cc.priority, cc.status,
          u_assign.full_name as assigned_to,
          u_create.full_name as created_by,
          cc.created_at, cc.resolved_at, cc.decision_summary
        FROM ComplianceCases cc
        LEFT JOIN Users u_assign ON cc.assigned_to = u_assign.id
        LEFT JOIN Users u_create ON cc.created_by = u_create.id
        ORDER BY cc.id DESC
      `);

      const headers = ["CaseCode", "Title", "Priority", "Status", "AssignedTo", "CreatedBy", "CreatedAt", "ResolvedAt", "DecisionSummary"];
      const csvContent = buildCsvString(headers, rows, (r) => [
        r.case_code,
        r.title,
        r.priority,
        r.status,
        r.assigned_to,
        r.created_by,
        r.created_at,
        r.resolved_at,
        r.decision_summary
      ]);

      await auditService.log({
        actorId: req.user.id,
        actorUsername: req.user.username,
        action: "EXPORT_REPORT",
        resourceType: "Reports",
        metadata: { type: "cases_csv", rowCount: rows.length }
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=mineshield_cases_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    res.status(400).json({ error: "Unsupported export type. Use ?type=discrepancies or ?type=cases" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
