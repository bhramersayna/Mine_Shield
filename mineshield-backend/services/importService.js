const { parse } = require("csv-parse/sync");
const { run, get, all, transaction, normalizeVehicleNo } = require("../db");
const storageService = require("./storageService");
const auditService = require("./auditService");

class ImportService {
  // Parse CSV buffer and return headers and raw rows
  parseCsv(buffer) {
    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    if (rows.length > 50000) {
      throw new Error(`Import payload exceeds maximum permissible batch size of 50,000 rows (received ${rows.length} rows). Please split large files.`);
    }
    return rows;
  }

  // Generate preview of uploaded CSV with column detection & validation summary
  previewCsv(buffer, sourceType, customMapping = {}) {
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) {
      throw new Error("The uploaded CSV file is empty.");
    }

    const availableColumns = Object.keys(rows[0]);
    const detectedMapping = this.detectColumnMapping(availableColumns, sourceType, customMapping);

    let validCount = 0;
    let invalidCount = 0;
    const sampleErrors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const validation = this.validateRow(row, sourceType, detectedMapping, i + 1);
      if (validation.isValid) {
        validCount++;
      } else {
        invalidCount++;
        if (sampleErrors.length < 5) {
          sampleErrors.push({ row: i + 1, error: validation.error, data: row });
        }
      }
    }

    return {
      totalRows: rows.length,
      validRows: validCount,
      invalidRows: invalidCount,
      availableColumns,
      detectedMapping,
      previewRows: rows.slice(0, 5),
      sampleErrors
    };
  }

  // Detect column mapping based on standard naming variations
  detectColumnMapping(columns, sourceType, customMapping = {}) {
    const mapping = {};
    const lowerCols = columns.reduce((acc, col) => {
      acc[col.toLowerCase().replace(/[^a-z0-9]/g, "")] = col;
      return acc;
    }, {});

    if (sourceType === "PERMIT") {
      mapping.permit_number = customMapping.permit_number || lowerCols.permitnumber || lowerCols.permitno || lowerCols.permit || "";
      mapping.vehicle_registration = customMapping.vehicle_registration || lowerCols.vehicleregistration || lowerCols.vehicleno || lowerCols.truckno || lowerCols.vehicle || "";
      mapping.mineral_type = customMapping.mineral_type || lowerCols.mineraltype || lowerCols.mineral || "";
      mapping.authorized_quantity = customMapping.authorized_quantity || lowerCols.authorizedquantity || lowerCols.quantity || lowerCols.tons || lowerCols.permittedquantity || "";
      mapping.origin = customMapping.origin || lowerCols.origin || lowerCols.source || lowerCols.quarry || "";
      mapping.destination = customMapping.destination || lowerCols.destination || lowerCols.crusher || "";
      mapping.issue_timestamp = customMapping.issue_timestamp || lowerCols.issuetimestamp || lowerCols.issuedat || lowerCols.date || "";
      mapping.valid_until = customMapping.valid_until || lowerCols.validuntil || lowerCols.expiry || "";
      mapping.source_system = customMapping.source_system || lowerCols.sourcesystem || "";
    } else if (sourceType === "CHECKPOINT") {
      mapping.event_id = customMapping.event_id || lowerCols.eventid || lowerCols.id || lowerCols.scanno || "";
      mapping.permit_number = customMapping.permit_number || lowerCols.permitnumber || lowerCols.permitno || lowerCols.permit || "";
      mapping.vehicle_registration = customMapping.vehicle_registration || lowerCols.vehicleregistration || lowerCols.vehicleno || lowerCols.truckno || lowerCols.vehicle || "";
      mapping.checkpoint_id = customMapping.checkpoint_id || lowerCols.checkpointid || lowerCols.checkpostid || lowerCols.stationid || "";
      mapping.checkpoint_name = customMapping.checkpoint_name || lowerCols.checkpointname || lowerCols.checkpostname || lowerCols.location || "";
      mapping.event_timestamp = customMapping.event_timestamp || lowerCols.eventtimestamp || lowerCols.scantimestamp || lowerCols.timestamp || lowerCols.datetime || "";
      mapping.recorded_quantity = customMapping.recorded_quantity || lowerCols.recordedquantity || lowerCols.quantity || lowerCols.tons || "";
      mapping.direction = customMapping.direction || lowerCols.direction || "";
      mapping.source_system = customMapping.source_system || lowerCols.sourcesystem || "";
    } else if (sourceType === "WEIGHBRIDGE") {
      mapping.transaction_id = customMapping.transaction_id || lowerCols.transactionid || lowerCols.ticketno || lowerCols.slipno || lowerCols.id || "";
      mapping.permit_number = customMapping.permit_number || lowerCols.permitnumber || lowerCols.permitno || lowerCols.permit || "";
      mapping.vehicle_registration = customMapping.vehicle_registration || lowerCols.vehicleregistration || lowerCols.vehicleno || lowerCols.truckno || lowerCols.vehicle || "";
      mapping.weighbridge_id = customMapping.weighbridge_id || lowerCols.weighbridgeid || lowerCols.scaleid || lowerCols.stationid || "";
      mapping.gross_weight = customMapping.gross_weight || lowerCols.grossweight || lowerCols.gross || "";
      mapping.tare_weight = customMapping.tare_weight || lowerCols.tareweight || lowerCols.tare || "";
      mapping.net_weight = customMapping.net_weight || lowerCols.netweight || lowerCols.net || lowerCols.quantity || "";
      mapping.measurement_timestamp = customMapping.measurement_timestamp || lowerCols.measurementtimestamp || lowerCols.weighedat || lowerCols.timestamp || "";
      mapping.source_system = customMapping.source_system || lowerCols.sourcesystem || "";
    }

    return mapping;
  }

  // Validate a single parsed row
  validateRow(row, sourceType, mapping, rowNumber) {
    if (sourceType === "PERMIT") {
      const permitNo = row[mapping.permit_number];
      const vehicle = row[mapping.vehicle_registration];
      const mineral = row[mapping.mineral_type];
      const qtyRaw = row[mapping.authorized_quantity];

      if (!permitNo || String(permitNo).trim() === "") {
        return { isValid: false, error: "Missing required permit number" };
      }
      if (!vehicle || String(vehicle).trim() === "") {
        return { isValid: false, error: "Missing required vehicle registration number" };
      }
      if (!mineral || String(mineral).trim() === "") {
        return { isValid: false, error: "Missing required mineral type" };
      }
      const qty = parseFloat(qtyRaw);
      if (isNaN(qty) || qty <= 0) {
        return { isValid: false, error: `Invalid authorized quantity '${qtyRaw}': must be a positive number` };
      }
      return { isValid: true };
    }

    if (sourceType === "CHECKPOINT") {
      const eventId = row[mapping.event_id];
      const vehicle = row[mapping.vehicle_registration];
      const checkpointId = row[mapping.checkpoint_id];
      const timestamp = row[mapping.event_timestamp];

      if (!eventId || String(eventId).trim() === "") {
        return { isValid: false, error: "Missing required event ID" };
      }
      if (!vehicle || String(vehicle).trim() === "") {
        return { isValid: false, error: "Missing required vehicle registration number" };
      }
      if (!checkpointId || String(checkpointId).trim() === "") {
        return { isValid: false, error: "Missing required checkpoint identifier" };
      }
      if (!timestamp || String(timestamp).trim() === "") {
        return { isValid: false, error: "Missing required event timestamp" };
      }
      return { isValid: true };
    }

    if (sourceType === "WEIGHBRIDGE") {
      const txnId = row[mapping.transaction_id];
      const vehicle = row[mapping.vehicle_registration];
      const wbId = row[mapping.weighbridge_id];
      const timestamp = row[mapping.measurement_timestamp];
      const netWeightRaw = row[mapping.net_weight];

      if (!txnId || String(txnId).trim() === "") {
        return { isValid: false, error: "Missing required transaction ID" };
      }
      if (!vehicle || String(vehicle).trim() === "") {
        return { isValid: false, error: "Missing required vehicle registration number" };
      }
      if (!wbId || String(wbId).trim() === "") {
        return { isValid: false, error: "Missing required weighbridge identifier" };
      }
      if (!timestamp || String(timestamp).trim() === "") {
        return { isValid: false, error: "Missing required measurement timestamp" };
      }

      let netWeight = parseFloat(netWeightRaw);
      if (isNaN(netWeight)) {
        // Try calculating from gross - tare
        const gross = parseFloat(row[mapping.gross_weight]);
        const tare = parseFloat(row[mapping.tare_weight]);
        if (!isNaN(gross) && !isNaN(tare) && gross >= tare) {
          netWeight = gross - tare;
        } else {
          return { isValid: false, error: `Invalid net weight '${netWeightRaw}': must be a valid non-negative number` };
        }
      } else if (netWeight < 0) {
        return { isValid: false, error: `Net weight cannot be negative: '${netWeightRaw}'` };
      }

      return { isValid: true };
    }

    return { isValid: false, error: "Unknown source type" };
  }

  // Process & execute full import inside a database transaction
  async executeImport({ fileBuffer, originalFilename, sourceType, userId = null, customMapping = {} }) {
    const rows = this.parseCsv(fileBuffer);
    if (rows.length === 0) {
      throw new Error("Cannot import an empty CSV file.");
    }

    // Save original file to configured storage
    const storageResult = await storageService.saveFile(fileBuffer, originalFilename, "text/csv");
    const fileHash = storageResult.hash;

    // Check duplicate import by file hash
    const existingImport = await get(
      "SELECT id, file_name, created_at FROM DataImports WHERE file_hash = ? AND status = 'COMPLETED'",
      [fileHash]
    );
    if (existingImport) {
      throw new Error(
        `Duplicate Import Detected: An identical file was already imported as Import #${existingImport.id} on ${new Date(existingImport.created_at).toLocaleString()}`
      );
    }

    const availableColumns = Object.keys(rows[0]);
    const mapping = this.detectColumnMapping(availableColumns, sourceType, customMapping);

    return await transaction(async () => {
      // 1. Create DataImports record
      const importRes = await run(
        `INSERT INTO DataImports (source_type, file_name, file_hash, file_size, total_rows, uploaded_by, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PROCESSING')`,
        [sourceType, originalFilename, fileHash, fileBuffer.length, rows.length, userId]
      );
      const importId = importRes.lastID;

      let acceptedCount = 0;
      let rejectedCount = 0;

      // 2. Process rows
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const validation = this.validateRow(row, sourceType, mapping, i + 1);

        if (!validation.isValid) {
          rejectedCount++;
          await run(
            `INSERT INTO ImportRowErrors (import_id, row_number, raw_row_json, error_message)
             VALUES (?, ?, ?, ?)`,
            [importId, i + 1, JSON.stringify(row), validation.error]
          );
          continue;
        }

        // Insert into corresponding normalized table
        if (sourceType === "PERMIT") {
          const permitNo = String(row[mapping.permit_number]).trim();
          const vehicleNo = String(row[mapping.vehicle_registration]).trim();
          const mineral = String(row[mapping.mineral_type]).trim();
          const qty = parseFloat(row[mapping.authorized_quantity]);
          const origin = row[mapping.origin] ? String(row[mapping.origin]).trim() : "Unspecified";
          const dest = row[mapping.destination] ? String(row[mapping.destination]).trim() : "Unspecified";
          const issueTime = row[mapping.issue_timestamp] ? String(row[mapping.issue_timestamp]).trim() : null;
          const validUntil = row[mapping.valid_until] ? String(row[mapping.valid_until]).trim() : null;
          const sourceSys = row[mapping.source_system] ? String(row[mapping.source_system]).trim() : "MINING_PORTAL";

          await run(
            `INSERT INTO PermitRecords 
             (source_permit_no, vehicle_no, vehicle_no_norm, mineral_type, authorized_quantity, origin, destination, issue_timestamp, valid_until, source_system, import_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [permitNo, vehicleNo, normalizeVehicleNo(vehicleNo), mineral, qty, origin, dest, issueTime, validUntil, sourceSys, importId]
          );
          acceptedCount++;
        } else if (sourceType === "CHECKPOINT") {
          const eventId = String(row[mapping.event_id]).trim();
          const permitNo = row[mapping.permit_number] ? String(row[mapping.permit_number]).trim() : null;
          const vehicleNo = String(row[mapping.vehicle_registration]).trim();
          const cpId = String(row[mapping.checkpoint_id]).trim();
          const cpName = row[mapping.checkpoint_name] ? String(row[mapping.checkpoint_name]).trim() : cpId;
          const eventTime = String(row[mapping.event_timestamp]).trim();
          const recordedQty = row[mapping.recorded_quantity] ? parseFloat(row[mapping.recorded_quantity]) : null;
          const direction = row[mapping.direction] ? String(row[mapping.direction]).trim() : "OUTBOUND";
          const sourceSys = row[mapping.source_system] ? String(row[mapping.source_system]).trim() : "RFID_POST";

          await run(
            `INSERT INTO CheckpointRecords
             (source_event_id, permit_no, vehicle_no, vehicle_no_norm, checkpoint_id, checkpoint_name, event_timestamp, recorded_quantity, direction, source_system, import_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [eventId, permitNo, vehicleNo, normalizeVehicleNo(vehicleNo), cpId, cpName, eventTime, recordedQty, direction, sourceSys, importId]
          );
          acceptedCount++;
        } else if (sourceType === "WEIGHBRIDGE") {
          const txnId = String(row[mapping.transaction_id]).trim();
          const permitNo = row[mapping.permit_number] ? String(row[mapping.permit_number]).trim() : null;
          const vehicleNo = String(row[mapping.vehicle_registration]).trim();
          const wbId = String(row[mapping.weighbridge_id]).trim();
          const gross = row[mapping.gross_weight] ? parseFloat(row[mapping.gross_weight]) : null;
          const tare = row[mapping.tare_weight] ? parseFloat(row[mapping.tare_weight]) : null;
          let net = parseFloat(row[mapping.net_weight]);
          if (isNaN(net) && gross !== null && tare !== null) {
            net = gross - tare;
          }
          const measTime = String(row[mapping.measurement_timestamp]).trim();
          const sourceSys = row[mapping.source_system] ? String(row[mapping.source_system]).trim() : "WEIGHBRIDGE_SCALE";

          await run(
            `INSERT INTO WeighbridgeRecords
             (source_transaction_id, permit_no, vehicle_no, vehicle_no_norm, weighbridge_id, gross_weight, tare_weight, net_weight, measurement_timestamp, source_system, import_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [txnId, permitNo, vehicleNo, normalizeVehicleNo(vehicleNo), wbId, gross, tare, net, measTime, sourceSys, importId]
          );
          acceptedCount++;
        }
      }

      // 3. Update DataImports record with final counts
      const status = rejectedCount === 0 ? "COMPLETED" : acceptedCount > 0 ? "PARTIAL" : "FAILED";
      await run(
        `UPDATE DataImports 
         SET accepted_rows = ?, rejected_rows = ?, status = ?
         WHERE id = ?`,
        [acceptedCount, rejectedCount, status, importId]
      );

      // 4. Audit Log
      await auditService.log({
        actorId: userId,
        action: "IMPORT_CSV",
        resourceType: "DataImports",
        resourceId: importId,
        metadata: { sourceType, originalFilename, total: rows.length, accepted: acceptedCount, rejected: rejectedCount }
      });

      return {
        importId,
        sourceType,
        totalRows: rows.length,
        acceptedRows: acceptedCount,
        rejectedRows: rejectedCount,
        status,
        fileHash
      };
    });
  }

  // Get list of past imports
  async getImportsList(limit = 50) {
    return await all(`
      SELECT di.*, u.username as uploader_username, u.full_name as uploader_name
      FROM DataImports di
      LEFT JOIN Users u ON di.uploaded_by = u.id
      ORDER BY di.id DESC
      LIMIT ?
    `, [limit]);
  }

  // Get row errors for a specific import
  async getImportErrors(importId) {
    return await all(`
      SELECT * FROM ImportRowErrors
      WHERE import_id = ?
      ORDER BY row_number ASC
    `, [importId]);
  }
}

module.exports = new ImportService();
