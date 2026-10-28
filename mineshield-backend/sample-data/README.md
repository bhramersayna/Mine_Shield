# MineShield Sample Demonstration Datasets

These CSV files provide realistic mineral transportation records from three independent operational sources:
1. **Permits Portal (`permits.csv`)**: 11 records from the state mining regulatory department.
2. **Checkpoint RFID / Toll Posts (`checkpoints.csv`)**: 9 records from forest and highway surveillance posts.
3. **Weighbridge Systems (`weighbridges.csv`)**: 10 records from automated weighbridge scale terminals.
4. **Malformed File (`malformed.csv`)**: 3 deliberately invalid rows for testing the import validation pipeline.

## Expected Discrepancy Findings
When reconciliation is executed with standard 5% tolerance:
- **Clean Exact Matches**:
  - `PER-2026-101`: Exactly matched across all 3 sources (25.0 T, vehicle UP32AB1001).
  - `PER-2026-109`: Exactly matched across all 3 sources (20.0 T, vehicle UP32AB1009).
  - `PER-2026-110`: Exactly matched across all 3 sources (16.0 T, vehicle UP32AB1010).
- **Rule 1: Quantity Mismatch**:
  - `PER-2026-102`: Authorized 30.00 T vs Weighbridge Net 36.50 T (+6.50 T / +21.7% variance, exceeds tolerance).
- **Rule 2: Missing Checkpoint Record**:
  - `PER-2026-103`: Has permit and weighbridge records, but no checkpoint record logged anywhere along route.
- **Rule 3: Missing Weighbridge Record**:
  - `PER-2026-104`: Has permit and checkpoint record, but vehicle never registered at destination weighbridge.
- **Rule 4: Vehicle Mismatch**:
  - `PER-2026-105`: Permit issued for `UP32AB1005`, but checkpoint logged `UP32XY9999` for the same permit.
- **Rule 5: Duplicate Record**:
  - `WB-TXN-507` (PER-2026-107): Appears twice in weighbridge log within 2 minutes.
- **Rule 6: Incomplete Record**:
  - `EVT-806`: Missing permit number on checkpoint observation for `UP32AB1006`.
- **Rule 7: Ambiguous Match**:
  - `EVT-808`: Checkpoint observed vehicle `UP32AB1008` without permit number, but two active permits (`PER-2026-108` and `PER-2026-108B`) exist for that vehicle within the same time window.
