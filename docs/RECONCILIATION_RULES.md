# MineShield Reconciliation Engine Rules Specification

The MineShield Reconciliation Engine (`services/reconciliationEngine.js`) executes an automated, deterministic audit over multi-source mineral logistics records.

---

## 1. Core Operating Principles & Invariants

1. **Deterministic Matching**: The engine operates purely on factual data comparisons without non-deterministic heuristics or fabricated approximations.
2. **Source Availability Awareness**: The engine **never** flags a source as "missing" simply because that data feed has not been imported. It dynamically inspects `DataImports` to verify whether Checkpoint or Weighbridge data feeds have actually been ingested.
3. **Idempotent Execution**: Running reconciliation multiple times on unchanging source data yields identical results without generating redundant duplicate discrepancies.
4. **Non-Punitive Anomaly Isolation**: Discrepancies represent audit anomalies requiring regulatory review, not unilateral declarations of criminal fraud.
5. **Dynamic Tolerance Boundaries**: Tolerance thresholds (e.g., allowable weight variance) are parameter-driven rather than hardcoded.

---

## 2. Record Normalization & Composite Join Strategy

To match records across heterogeneous IT systems, raw fields are normalized before evaluation:

### Vehicle Registration Normalization
Different agencies record license plates with inconsistent formatting (e.g. `"KA-04-E-1234"`, `"KA 04 E 1234"`, `"ka04e1234"`). The function `normalizeVehicleNo()` strips all non-alphanumeric characters and converts to canonical uppercase:
$$\text{normalized} = \text{str}.\text{toUpperCase}().\text{replace}(/[\backslash s\backslash -\_]/g, "")$$
Example: `"KA-04-E-1234"` $\rightarrow$ `"KA04E1234"`.

### Temporal Transit Windowing
A permit issue timestamp is paired with checkpoint surveillance and scale measurement records falling within a configurable time window:
$$|T_{\text{transit}} - T_{\text{permit}}| \le W_{\text{window}} \quad (\text{Default } W = 24 \text{ hours})$$

---

## 3. The Eight Statutory Reconciliation Rules

### Rule 1: `QUANTITY_MISMATCH`
- **Regulatory Intent**: Detects physical overloading (road damage, safety violation) or under-reporting (unauthorized dumping, mineral theft).
- **Trigger Condition**:
  Let $Q_{\text{permit}}$ be the authorized permit tonnage and $Q_{\text{weighbridge}}$ be the net scale measurement ($\text{gross} - \text{tare}$).
  $$\Delta Q = |Q_{\text{weighbridge}} - Q_{\text{permit}}|$$
  $$\% \text{ Variance} = \left( \frac{\Delta Q}{Q_{\text{permit}}} \right) \times 100$$
  A discrepancy is raised if:
  $$\% \text{ Variance} > \text{quantity\_tolerance\_pct} \quad (\text{Default } 5.0\%)$$
- **Severity Classification**:
  - `CRITICAL`: $\% \text{ Variance} \ge 20.0\%$
  - `MAJOR`: $5.0\% < \% \text{ Variance} < 20.0\%$
  - `MINOR`: Borderline deviations with operator explanatory notes.

---

### Rule 2: `MISSING_CHECKPOINT`
- **Regulatory Intent**: Identifies transport vehicles that bypassed mandatory surveillance corridors, toll gates, or geo-fenced RFID checkpoints.
- **Trigger Condition**:
  A permit has an associated weighbridge scale ticket, but **zero** checkpoint transit logs match the normalized vehicle registration within the validity window.
- **Mandatory Guard Condition**:
  $$\text{checkpointSourceAvailable} == \text{true}$$
  If no checkpoint CSV file has been imported into MineShield, this rule is **silently bypassed** to eliminate false positive flags.
- **Severity**: `MAJOR`.

---

### Rule 3: `MISSING_WEIGHBRIDGE`
- **Regulatory Intent**: Identifies mineral transport vehicles detected in transit on public highways without a certified weight ticket from an authorized weighbridge.
- **Trigger Condition**:
  A permit has an associated checkpoint passage, but **zero** weighbridge records match the normalized vehicle registration.
- **Mandatory Guard Condition**:
  $$\text{weighbridgeSourceAvailable} == \text{true}$$
  If no weighbridge CSV file has been imported, this rule is **silently bypassed**.
- **Severity**: `CRITICAL`.

---

### Rule 4: `VEHICLE_MISMATCH`
- **Regulatory Intent**: Detects permit switching, license plate cloning, or unauthorized vehicle substitution en route.
- **Trigger Condition**:
  A weighbridge scale record or checkpoint transit record matches a specific permit number or e-waybill reference, but the observed vehicle registration diverges from the authorized permit vehicle:
  $$\text{normalizeVehicleNo}(V_{\text{observed}}) \ne \text{normalizeVehicleNo}(V_{\text{permit}})$$
- **Severity**: `CRITICAL`.

---

### Rule 5: `DUPLICATE_RECORD`
- **Regulatory Intent**: Prevents permit reuse, where a single authorized permit slip is recycled across multiple distinct transit trips to transport excess unaccounted ore.
- **Trigger Condition**:
  - A single permit number is associated with multiple distinct weighbridge scale tickets or multiple checkpoint passages separated by more than 2 hours.
  - Or an identical weighbridge ticket number appears more than once across disparate shipments.
- **Severity**: `CRITICAL`.

---

### Rule 6: `INCOMPLETE_RECORD`
- **Regulatory Intent**: Ensures all statutory documentation fields mandated by state mining regulations are fully populated before dispatch.
- **Trigger Condition**:
  Any ingested record possesses missing, blank, or `NULL` statutory values, such as:
  - Missing mineral specification (e.g. Iron Ore, Bauxite).
  - Missing tare weight or gross weight.
  - Missing timestamp or validity range.
  - Non-numeric or negative weight values.
- **Severity**: `MODERATE`.

---

### Rule 7: `AMBIGUOUS_MATCH`
- **Regulatory Intent**: Prevents false automation claims when sensor logs contain multiple candidate matches for a single vehicle within overlapping transit windows.
- **Trigger Condition**:
  Two or more distinct checkpoint passage events or scale weighments match the same vehicle and transit window without a unique permit mapping key.
- **Action**:
  Flagged for human compliance reviewer intervention to manually inspect timestamp corridors and determine the valid assignment.
- **Severity**: `MODERATE`.

---

### Rule 8: `CROSS_SOURCE_INCONSISTENCY`
- **Regulatory Intent**: Uncovers conflicting operational attributes across disparate reporting bodies.
- **Trigger Condition**:
  The record joins on vehicle and time window, but peripheral metadata contradicts:
  - Declared mineral type at permit office differs from physical observation at checkpoint.
  - Mining leaseholder name does not match destination processing facility records.
- **Severity**: `MAJOR`.

---

## 4. Changed-Data Handling & Auto-Resolution

MineShield treats data streams as dynamic. When operational data arrives out of order:

1. **Initial Run**:
   Permits and Weighbridges are imported without Checkpoint records. Rule 2 (`MISSING_CHECKPOINT`) is safely suppressed because checkpoint data is unavailable.
2. **Surveillance Feed Arrival**:
   Checkpoint records arrive later via CSV import. The reviewer triggers a reconciliation rerun.
3. **Auto-Resolution Cycle**:
   - The engine discovers that previously unmatched records now possess valid joins.
   - Any prior open discrepancy flagged as `MISSING_CHECKPOINT` for that record is automatically transitioned:
     - `status`: `"RESOLVED"`
     - Resolution note appended: `"Auto-resolved by Reconciliation Engine: Checkpoint record arrived in batch import #..."`
   - An entry is immutably written to `AuditLogs`.
