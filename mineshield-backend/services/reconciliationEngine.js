const { run, get, all, transaction } = require("../db");
const auditService = require("./auditService");

class ReconciliationEngine {
  // Execute reconciliation across all imported records
  async runReconciliation({ userId = null, quantityTolerancePct = 5.0 }) {
    const runCode = `RUN-${Date.now().toString().slice(-6)}`;
    const startTime = new Date().toISOString();

    return await transaction(async () => {
      // 1. Initialize Reconciliation Run
      const runInsert = await run(
        `INSERT INTO ReconciliationRuns 
         (run_code, status, quantity_tolerance_pct, initiated_by, started_at)
         VALUES (?, 'IN_PROGRESS', ?, ?, ?)`,
        [runCode, quantityTolerancePct, userId, startTime]
      );
      const runId = runInsert.lastID;

      // 2. Fetch all operational records
      const permits = await all("SELECT * FROM PermitRecords ORDER BY id ASC");
      const checkpoints = await all("SELECT * FROM CheckpointRecords ORDER BY id ASC");
      const weighbridges = await all("SELECT * FROM WeighbridgeRecords ORDER BY id ASC");

      let matchedPermitsCount = 0;
      let unmatchedPermitsCount = 0;
      let discrepanciesCount = 0;

      // Pre-index Checkpoints by Permit No and Normalized Vehicle
      const cpByPermit = {};
      const cpByVehicle = {};
      for (const cp of checkpoints) {
        if (cp.permit_no && cp.permit_no.trim() !== "") {
          const pKey = cp.permit_no.trim().toUpperCase();
          if (!cpByPermit[pKey]) cpByPermit[pKey] = [];
          cpByPermit[pKey].push(cp);
        }
        const vKey = cp.vehicle_no_norm;
        if (!cpByVehicle[vKey]) cpByVehicle[vKey] = [];
        cpByVehicle[vKey].push(cp);
      }

      // Pre-index Weighbridges by Permit No and Normalized Vehicle
      const wbByPermit = {};
      const wbByVehicle = {};
      const wbByTxnId = {};
      for (const wb of weighbridges) {
        if (wb.permit_no && wb.permit_no.trim() !== "") {
          const pKey = wb.permit_no.trim().toUpperCase();
          if (!wbByPermit[pKey]) wbByPermit[pKey] = [];
          wbByPermit[pKey].push(wb);
        }
        const vKey = wb.vehicle_no_norm;
        if (!wbByVehicle[vKey]) wbByVehicle[vKey] = [];
        wbByVehicle[vKey].push(wb);

        const txnKey = wb.source_transaction_id.trim();
        if (!wbByTxnId[txnKey]) wbByTxnId[txnKey] = [];
        wbByTxnId[txnKey].push(wb);
      }

      // Helper to check and record discrepancy safely (idempotent: avoids duplicates)
      const recordDiscrepancy = async (disc) => {
        const existing = await get(
          `SELECT id FROM Discrepancies 
           WHERE category = ? AND rule_id = ? 
           AND (permit_id = ? OR (permit_id IS NULL AND ? IS NULL))
           AND (checkpoint_id = ? OR (checkpoint_id IS NULL AND ? IS NULL))
           AND (weighbridge_id = ? OR (weighbridge_id IS NULL AND ? IS NULL))
           AND status NOT IN ('RESOLVED', 'DISMISSED')`,
          [
            disc.category, disc.rule_id,
            disc.permit_id || null, disc.permit_id || null,
            disc.checkpoint_id || null, disc.checkpoint_id || null,
            disc.weighbridge_id || null, disc.weighbridge_id || null
          ]
        );

        if (!existing) {
          const discCode = `DSC-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
          await run(
            `INSERT INTO Discrepancies 
             (discrepancy_code, run_id, category, severity, status, rule_id, title, explanation, permit_id, checkpoint_id, weighbridge_id, expected_value, observed_value, variance_amount)
             VALUES (?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              discCode, runId, disc.category, disc.severity, disc.rule_id, disc.title, disc.explanation,
              disc.permit_id || null, disc.checkpoint_id || null, disc.weighbridge_id || null,
              disc.expected_value || null, disc.observed_value || null, disc.variance_amount || null
            ]
          );
          discrepanciesCount++;
        }
      };

      // -------------------------------------------------------------
      // MATCHING & RECONCILIATION OVER PERMITS
      // -------------------------------------------------------------
      for (const permit of permits) {
        const pKey = permit.source_permit_no.trim().toUpperCase();
        const vNorm = permit.vehicle_no_norm;

        // 1. Find matching Checkpoint record
        let matchedCp = null;
        let cpMatchType = "NONE";
        const cpPermitMatches = cpByPermit[pKey] || [];
        const cpVehicleMatches = cpByVehicle[vNorm] || [];

        if (cpPermitMatches.length === 1) {
          matchedCp = cpPermitMatches[0];
          cpMatchType = "EXACT";
        } else if (cpPermitMatches.length > 1) {
          matchedCp = cpPermitMatches[0];
          cpMatchType = "AMBIGUOUS";
        } else if (cpVehicleMatches.length === 1) {
          matchedCp = cpVehicleMatches[0];
          cpMatchType = "PROBABLE";
        } else if (cpVehicleMatches.length > 1) {
          matchedCp = cpVehicleMatches[0];
          cpMatchType = "AMBIGUOUS";
        }

        // 2. Find matching Weighbridge record
        let matchedWb = null;
        let wbMatchType = "NONE";
        const wbPermitMatches = wbByPermit[pKey] || [];
        const wbVehicleMatches = wbByVehicle[vNorm] || [];

        if (wbPermitMatches.length === 1) {
          matchedWb = wbPermitMatches[0];
          wbMatchType = "EXACT";
        } else if (wbPermitMatches.length > 1) {
          matchedWb = wbPermitMatches[0];
          wbMatchType = "AMBIGUOUS";
        } else if (wbVehicleMatches.length === 1) {
          matchedWb = wbVehicleMatches[0];
          wbMatchType = "PROBABLE";
        } else if (wbVehicleMatches.length > 1) {
          matchedWb = wbVehicleMatches[0];
          wbMatchType = "AMBIGUOUS";
        }

        // Determine Overall Match Classification
        let overallMatch = "UNMATCHED";
        let matchConfidence = 0.0;
        let matchCriteria = "No matching records found in auxiliary sources";

        if (matchedCp && matchedWb) {
          if (cpMatchType === "EXACT" && wbMatchType === "EXACT") {
            overallMatch = "EXACT";
            matchConfidence = 1.0;
            matchCriteria = "Exact permit number match on Checkpoint and Weighbridge";
          } else if (cpMatchType === "AMBIGUOUS" || wbMatchType === "AMBIGUOUS") {
            overallMatch = "AMBIGUOUS";
            matchConfidence = 0.5;
            matchCriteria = "Multiple candidate records found across sources";
          } else {
            overallMatch = "PROBABLE";
            matchConfidence = 0.8;
            matchCriteria = "Secondary match via normalized vehicle registration number";
          }
          matchedPermitsCount++;
        } else if (matchedCp || matchedWb) {
          overallMatch = "PROBABLE";
          matchConfidence = 0.6;
          matchCriteria = `Partial match: ${matchedCp ? "Checkpoint" : "Weighbridge"} record found`;
          matchedPermitsCount++;
        } else {
          overallMatch = "UNMATCHED";
          matchConfidence = 0.0;
          unmatchedPermitsCount++;
        }

        // Record Match in ReconciliationMatches
        await run(
          `INSERT INTO ReconciliationMatches 
           (run_id, permit_id, checkpoint_id, weighbridge_id, match_type, match_confidence, match_criteria)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            permit.id,
            matchedCp ? matchedCp.id : null,
            matchedWb ? matchedWb.id : null,
            overallMatch,
            matchConfidence,
            matchCriteria
          ]
        );

        // -------------------------------------------------------------
        // DISCREPANCY RULE CHECKS FOR THIS PERMIT
        // -------------------------------------------------------------

        // Rule 1: Quantity Mismatch (Permit vs Weighbridge)
        if (matchedWb) {
          const authQty = permit.authorized_quantity;
          const netQty = matchedWb.net_weight;
          const diff = netQty - authQty;
          const pctVariance = (Math.abs(diff) / authQty) * 100;

          if (pctVariance > quantityTolerancePct) {
            let severity = "MEDIUM";
            if (pctVariance > 25.0) severity = "CRITICAL";
            else if (pctVariance > 15.0) severity = "HIGH";

            await recordDiscrepancy({
              category: "QUANTITY_MISMATCH",
              severity,
              rule_id: "RULE_01_QUANTITY_TOLERANCE",
              title: `Quantity Variance (${pctVariance.toFixed(1)}%) exceeds ${quantityTolerancePct}% tolerance`,
              explanation: `Weighbridge recorded net weight ${netQty} Tons exceeds authorized permit quantity ${authQty} Tons by ${diff > 0 ? "+" : ""}${diff.toFixed(2)} Tons (${pctVariance.toFixed(1)}% variance).`,
              permit_id: permit.id,
              weighbridge_id: matchedWb.id,
              expected_value: `${authQty} Tons`,
              observed_value: `${netQty} Tons`,
              variance_amount: Number(diff.toFixed(2))
            });
          }
        }

        // Auto-resolve outdated MISSING_CHECKPOINT / MISSING_WEIGHBRIDGE if records were imported between runs
        if (matchedCp) {
          const staleCpDisc = await get(
            `SELECT id FROM Discrepancies 
             WHERE permit_id = ? AND category = 'MISSING_CHECKPOINT' AND status IN ('NEW', 'UNDER_REVIEW')`,
            [permit.id]
          );
          if (staleCpDisc) {
            await run(
              `UPDATE Discrepancies 
               SET status = 'RESOLVED', resolution_summary = ?, resolved_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [`Auto-resolved by ${runCode}: Matching checkpoint record (${matchedCp.source_event_id}) has been imported.`, staleCpDisc.id]
            );
            await run(
              `INSERT INTO DiscrepancyNotes (discrepancy_id, author_id, note_text, status_change) 
               VALUES (?, ?, ?, ?)`,
              [staleCpDisc.id, userId, `System auto-resolved: Checkpoint record ${matchedCp.source_event_id} was imported.`, "UNDER_REVIEW -> RESOLVED"]
            );
          }
        }

        if (matchedWb) {
          const staleWbDisc = await get(
            `SELECT id FROM Discrepancies 
             WHERE permit_id = ? AND category = 'MISSING_WEIGHBRIDGE' AND status IN ('NEW', 'UNDER_REVIEW')`,
            [permit.id]
          );
          if (staleWbDisc) {
            await run(
              `UPDATE Discrepancies 
               SET status = 'RESOLVED', resolution_summary = ?, resolved_at = CURRENT_TIMESTAMP 
               WHERE id = ?`,
              [`Auto-resolved by ${runCode}: Matching weighbridge record (${matchedWb.source_transaction_id}) has been imported.`, staleWbDisc.id]
            );
            await run(
              `INSERT INTO DiscrepancyNotes (discrepancy_id, author_id, note_text, status_change) 
               VALUES (?, ?, ?, ?)`,
              [staleWbDisc.id, userId, `System auto-resolved: Weighbridge record ${matchedWb.source_transaction_id} was imported.`, "UNDER_REVIEW -> RESOLVED"]
            );
          }
        }

        // Rule 2: Missing Checkpoint Record
        // Only evaluate if checkpoint dataset is available; never falsely flag if checkpoint source was not imported
        if (checkpoints.length > 0 && matchedWb && !matchedCp) {
          await recordDiscrepancy({
            category: "MISSING_CHECKPOINT",
            severity: "HIGH",
            rule_id: "RULE_02_MISSING_CHECKPOINT",
            title: `Missing Checkpoint Surveillance Record`,
            explanation: `Permit ${permit.source_permit_no} has a valid weighbridge measurement at ${matchedWb.weighbridge_id}, but no corresponding checkpoint observation was captured along the transit corridor.`,
            permit_id: permit.id,
            weighbridge_id: matchedWb.id,
            expected_value: "Checkpoint record present along route",
            observed_value: "No checkpoint observation found",
            variance_amount: null
          });
        }

        // Rule 3: Missing Weighbridge Record
        // Only evaluate if weighbridge dataset is available; never falsely flag if weighbridge source was not imported
        if (weighbridges.length > 0 && matchedCp && !matchedWb) {
          await recordDiscrepancy({
            category: "MISSING_WEIGHBRIDGE",
            severity: "HIGH",
            rule_id: "RULE_03_MISSING_WEIGHBRIDGE",
            title: `Missing Weighbridge Scale Measurement`,
            explanation: `Permit ${permit.source_permit_no} was observed passing ${matchedCp.checkpoint_name}, but no delivery scale record was registered at the destination weighbridge.`,
            permit_id: permit.id,
            checkpoint_id: matchedCp.id,
            expected_value: "Weighbridge measurement at destination",
            observed_value: "No weighbridge record found",
            variance_amount: null
          });
        }

        // Rule 4: Vehicle Mismatch
        if (matchedCp && matchedCp.permit_no && matchedCp.permit_no.trim().toUpperCase() === pKey) {
          if (matchedCp.vehicle_no_norm !== vNorm) {
            await recordDiscrepancy({
              category: "VEHICLE_MISMATCH",
              severity: "HIGH",
              rule_id: "RULE_04_VEHICLE_MISMATCH",
              title: `Vehicle Registration Discrepancy on Checkpoint`,
              explanation: `Permit ${permit.source_permit_no} authorizes vehicle '${permit.vehicle_no}', but checkpoint '${matchedCp.checkpoint_name}' logged vehicle '${matchedCp.vehicle_no}' for this permit number.`,
              permit_id: permit.id,
              checkpoint_id: matchedCp.id,
              expected_value: permit.vehicle_no,
              observed_value: matchedCp.vehicle_no,
              variance_amount: null
            });
          }
        }

        if (matchedWb && matchedWb.permit_no && matchedWb.permit_no.trim().toUpperCase() === pKey) {
          if (matchedWb.vehicle_no_norm !== vNorm) {
            await recordDiscrepancy({
              category: "VEHICLE_MISMATCH",
              severity: "HIGH",
              rule_id: "RULE_04_VEHICLE_MISMATCH",
              title: `Vehicle Registration Discrepancy on Weighbridge`,
              explanation: `Permit ${permit.source_permit_no} authorizes vehicle '${permit.vehicle_no}', but weighbridge '${matchedWb.weighbridge_id}' registered vehicle '${matchedWb.vehicle_no}' for this permit.`,
              permit_id: permit.id,
              weighbridge_id: matchedWb.id,
              expected_value: permit.vehicle_no,
              observed_value: matchedWb.vehicle_no,
              variance_amount: null
            });
          }
        }

        // Rule 8: Cross-Source Inconsistency (Contradictory physical observations between Checkpoint and Weighbridge)
        if (matchedCp && matchedWb) {
          // Check A: Conflicting recorded transit weight vs scale net weight
          if (matchedCp.recorded_quantity !== null && matchedCp.recorded_quantity !== undefined && matchedWb.net_weight) {
            const cpQty = parseFloat(matchedCp.recorded_quantity);
            const wbQty = parseFloat(matchedWb.net_weight);
            const crossDiff = Math.abs(wbQty - cpQty);
            const crossPctVariance = (crossDiff / cpQty) * 100;

            if (crossPctVariance > quantityTolerancePct) {
              await recordDiscrepancy({
                category: "CROSS_SOURCE_INCONSISTENCY",
                severity: crossPctVariance > 20.0 ? "HIGH" : "MEDIUM",
                rule_id: "RULE_08_CROSS_SOURCE_INCONSISTENCY",
                title: `Cross-Source Quantity Discrepancy (${crossPctVariance.toFixed(1)}%)`,
                explanation: `Checkpoint '${matchedCp.checkpoint_name}' logged vehicle carrying ${cpQty} Tons, but destination weighbridge '${matchedWb.weighbridge_id}' measured net weight of ${wbQty} Tons (${crossDiff > 0 ? "+" : ""}${crossDiff.toFixed(2)} Tons variance).`,
                permit_id: permit.id,
                checkpoint_id: matchedCp.id,
                weighbridge_id: matchedWb.id,
                expected_value: `${cpQty} Tons (Checkpoint Log)`,
                observed_value: `${wbQty} Tons (Weighbridge Scale)`,
                variance_amount: Number(crossDiff.toFixed(2))
              });
            }
          }

          // Check B: Temporal Sequence Inconsistency (Observed at corridor checkpoint AFTER arrival at destination weighbridge)
          if (matchedCp.event_timestamp && matchedWb.measurement_timestamp) {
            const cpTime = new Date(matchedCp.event_timestamp).getTime();
            const wbTime = new Date(matchedWb.measurement_timestamp).getTime();
            if (!isNaN(cpTime) && !isNaN(wbTime) && cpTime > wbTime) {
              await recordDiscrepancy({
                category: "CROSS_SOURCE_INCONSISTENCY",
                severity: "HIGH",
                rule_id: "RULE_08_CROSS_SOURCE_INCONSISTENCY",
                title: `Chronological Sequence Inversion across Surveillance Sources`,
                explanation: `Corridor checkpoint observation at '${matchedCp.checkpoint_name}' (${matchedCp.event_timestamp}) is timestamped AFTER destination scale measurement at '${matchedWb.weighbridge_id}' (${matchedWb.measurement_timestamp}). Physical route sequence anomaly.`,
                permit_id: permit.id,
                checkpoint_id: matchedCp.id,
                weighbridge_id: matchedWb.id,
                expected_value: `Checkpoint timestamp before ${matchedWb.measurement_timestamp}`,
                observed_value: `Checkpoint timestamp ${matchedCp.event_timestamp}`,
                variance_amount: null
              });
            }
          }
        }
      }

      // -------------------------------------------------------------
      // INDEPENDENT SOURCE CHECKS: DUPLICATES, INCOMPLETES & AMBIGUITIES
      // -------------------------------------------------------------

      // Rule 5: Duplicate Weighbridge Transactions
      for (const [txnId, items] of Object.entries(wbByTxnId)) {
        if (items.length > 1) {
          for (let i = 1; i < items.length; i++) {
            await recordDiscrepancy({
              category: "DUPLICATE_RECORD",
              severity: "MEDIUM",
              rule_id: "RULE_05_DUPLICATE_TRANSACTION",
              title: `Duplicate Weighbridge Transaction '${txnId}'`,
              explanation: `Weighbridge transaction ID '${txnId}' appears ${items.length} times in the imported operational dataset.`,
              weighbridge_id: items[i].id,
              expected_value: "Unique transaction record",
              observed_value: `Encountered ${items.length} records for transaction ID ${txnId}`,
              variance_amount: null
            });
          }
        }
      }

      // Rule 6: Incomplete Records (Checkpoint without permit number)
      for (const cp of checkpoints) {
        if (!cp.permit_no || cp.permit_no.trim() === "") {
          await recordDiscrepancy({
            category: "INCOMPLETE_RECORD",
            severity: "LOW",
            rule_id: "RULE_06_INCOMPLETE_CHECKPOINT_RECORD",
            title: `Checkpoint Observation missing Permit Reference`,
            explanation: `Checkpoint observation '${cp.source_event_id}' for vehicle '${cp.vehicle_no}' was logged without a transit permit number.`,
            checkpoint_id: cp.id,
            expected_value: "Valid permit number",
            observed_value: "Blank / null",
            variance_amount: null
          });
        }
      }

      // Rule 7: Ambiguous Match Check (Vehicles with multiple active permits)
      for (const cp of checkpoints) {
        if (!cp.permit_no || cp.permit_no.trim() === "") {
          const matchingPermits = permits.filter((p) => p.vehicle_no_norm === cp.vehicle_no_norm);
          if (matchingPermits.length > 1) {
            await recordDiscrepancy({
              category: "AMBIGUOUS_MATCH",
              severity: "MEDIUM",
              rule_id: "RULE_07_AMBIGUOUS_PERMIT_MATCH",
              title: `Ambiguous Match: Vehicle '${cp.vehicle_no}' linked to multiple permits`,
              explanation: `Vehicle '${cp.vehicle_no}' observed at ${cp.checkpoint_name} has ${matchingPermits.length} candidate permits (${matchingPermits.map((p) => p.source_permit_no).join(", ")}) active during this period. Human reviewer resolution required.`,
              checkpoint_id: cp.id,
              expected_value: "Single unique permit candidate",
              observed_value: `${matchingPermits.length} candidate permits found`,
              variance_amount: null
            });
          }
        }
      }

      // 3. Finalize Reconciliation Run Record
      const completedTime = new Date().toISOString();
      await run(
        `UPDATE ReconciliationRuns 
         SET status = 'COMPLETED', total_permits_processed = ?, total_matched = ?, total_unmatched = ?, discrepancies_flagged = ?, completed_at = ?
         WHERE id = ?`,
        [permits.length, matchedPermitsCount, unmatchedPermitsCount, discrepanciesCount, completedTime, runId]
      );

      // 4. Audit Log
      await auditService.log({
        actorId: userId,
        action: "RUN_RECONCILIATION",
        resourceType: "ReconciliationRuns",
        resourceId: runId,
        metadata: {
          runCode,
          processed: permits.length,
          matched: matchedPermitsCount,
          unmatched: unmatchedPermitsCount,
          discrepancies: discrepanciesCount,
          tolerancePct: quantityTolerancePct
        }
      });

      return {
        runId,
        runCode,
        totalPermitsProcessed: permits.length,
        totalMatched: matchedPermitsCount,
        totalUnmatched: unmatchedPermitsCount,
        discrepanciesFlagged: discrepanciesCount,
        quantityTolerancePct,
        sourceAvailability: {
          permitsImported: permits.length,
          checkpointsImported: checkpoints.length,
          weighbridgesImported: weighbridges.length,
          checkpointDatasetAvailable: checkpoints.length > 0,
          weighbridgeDatasetAvailable: weighbridges.length > 0
        },
        status: "COMPLETED"
      };
    });
  }

  // Get recent reconciliation runs
  async getRunsList(limit = 20) {
    return await all(`
      SELECT rr.*, u.username as initiator_username, u.full_name as initiator_name
      FROM ReconciliationRuns rr
      LEFT JOIN Users u ON rr.initiated_by = u.id
      ORDER BY rr.id DESC
      LIMIT ?
    `, [limit]);
  }

  // Get run details with match summary
  async getRunDetails(runId) {
    const runRecord = await get(
      `SELECT rr.*, u.username as initiator_username, u.full_name as initiator_name
       FROM ReconciliationRuns rr
       LEFT JOIN Users u ON rr.initiated_by = u.id
       WHERE rr.id = ?`,
      [runId]
    );

    if (!runRecord) return null;

    const matches = await all(`
      SELECT rm.*, 
        pr.source_permit_no, pr.vehicle_no as permit_vehicle, pr.authorized_quantity,
        cp.checkpoint_name, cp.vehicle_no as checkpoint_vehicle,
        wb.weighbridge_id, wb.vehicle_no as weighbridge_vehicle, wb.net_weight
      FROM ReconciliationMatches rm
      LEFT JOIN PermitRecords pr ON rm.permit_id = pr.id
      LEFT JOIN CheckpointRecords cp ON rm.checkpoint_id = cp.id
      LEFT JOIN WeighbridgeRecords wb ON rm.weighbridge_id = wb.id
      WHERE rm.run_id = ?
      ORDER BY rm.id ASC
    `, [runId]);

    const discrepancies = await all(`
      SELECT d.*, u.full_name as assigned_to_name
      FROM Discrepancies d
      LEFT JOIN Users u ON d.assigned_to = u.id
      WHERE d.run_id = ?
      ORDER BY d.id DESC
    `, [runId]);

    return {
      run: runRecord,
      matches,
      discrepancies
    };
  }
}

module.exports = new ReconciliationEngine();
