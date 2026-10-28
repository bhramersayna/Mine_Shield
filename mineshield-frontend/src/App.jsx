import { useState, useEffect } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000/api";

function App() {
  // Navigation State (11 Primary Views)
  const [currentNav, setCurrentNav] = useState("overview");

  // Auth State
  const [token, setToken] = useState(() => localStorage.getItem("mineshield_token") || "");
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("mineshield_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Login form state (if logged out)
  const [loginForm, setLoginForm] = useState({ username: "reviewer", password: "Reviewer@MineShield2026" });

  // Notifications & Global Status
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(false);

  // Overview Data
  const [overviewMetrics, setOverviewMetrics] = useState(null);
  const [analyticsBreakdown, setAnalyticsBreakdown] = useState(null);

  // Records Data
  const [recordsTab, setRecordsTab] = useState("permits");
  const [permits, setPermits] = useState([]);
  const [checkpoints, setCheckpoints] = useState([]);
  const [weighbridges, setWeighbridges] = useState([]);
  const [recordsSearch, setRecordsSearch] = useState("");

  // Import Workflow State
  const [importSourceType, setImportSourceType] = useState("PERMIT");
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const [selectedImportErrors, setSelectedImportErrors] = useState(null);

  // Reconciliation State
  const [tolerancePct, setTolerancePct] = useState(5.0);
  const [reconciliationRuns, setReconciliationRuns] = useState([]);
  const [selectedRunDetails, setSelectedRunDetails] = useState(null);

  // Discrepancy State
  const [discrepancies, setDiscrepancies] = useState([]);
  const [discrepancyFilter, setDiscrepancyFilter] = useState({ category: "", severity: "", status: "", search: "" });
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState(null);
  const [statusUpdateForm, setStatusUpdateForm] = useState({ status: "UNDER_REVIEW", resolution_summary: "", note_text: "" });

  // Compliance Cases State
  const [complianceCases, setComplianceCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [createCaseModal, setCreateCaseModal] = useState(false);
  const [newCaseForm, setNewCaseForm] = useState({ title: "", description: "", priority: "MEDIUM", discrepancy_ids: [] });
  const [caseDecisionForm, setCaseDecisionForm] = useState({ status: "RESOLVED", decision_summary: "" });

  // Evidence State
  const [evidenceList, setEvidenceList] = useState([]);
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceDesc, setEvidenceDesc] = useState("");

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);

  // Users State
  const [usersList, setUsersList] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ username: "", password: "", full_name: "", email: "", role: "ComplianceReviewer" });

  // Settings State
  const [settingsList, setSettingsList] = useState([]);

  // Helper: Show banner notification
  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 6000);
  };

  // Helper: Authenticated fetch wrapper
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      ...(options.headers || {})
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Failed request`);
    }
    return data;
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem("mineshield_token", data.token);
      localStorage.setItem("mineshield_user", JSON.stringify(data.user));
      notify(`Welcome back, ${data.user.full_name} (${data.user.role})`);
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    setToken("");
    setCurrentUser(null);
    localStorage.removeItem("mineshield_token");
    localStorage.removeItem("mineshield_user");
    notify("Logged out successfully.", "info");
  };

  // Switch Role / Dev User shortcut
  const handleQuickLogin = async (roleName) => {
    const creds = {
      Administrator: { username: "admin", password: "Admin@MineShield2026" },
      ComplianceReviewer: { username: "reviewer", password: "Reviewer@MineShield2026" },
      ReadOnlyAuditor: { username: "auditor", password: "Auditor@MineShield2026" }
    };
    const c = creds[roleName];
    if (c) {
      setLoginForm(c);
      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c)
        });
        const data = await res.json();
        if (res.ok) {
          setToken(data.token);
          setCurrentUser(data.user);
          localStorage.setItem("mineshield_token", data.token);
          localStorage.setItem("mineshield_user", JSON.stringify(data.user));
          notify(`Switched context to ${data.user.full_name} (${data.user.role})`);
        }
      } catch (err) {
        notify(err.message, "danger");
      }
    }
  };

  // Load Primary Data Based on Current Navigation View
  useEffect(() => {
    if (!token) return;

    const loadData = async () => {
      try {
        if (currentNav === "overview") {
          const [m, b] = await Promise.all([
            apiFetch("/analytics/overview"),
            apiFetch("/analytics/breakdown")
          ]);
          setOverviewMetrics(m);
          setAnalyticsBreakdown(b);
        } else if (currentNav === "records") {
          if (recordsTab === "permits") {
            const data = await apiFetch(`/records/permits?search=${encodeURIComponent(recordsSearch)}`);
            setPermits(data.records);
          } else if (recordsTab === "checkpoints") {
            const data = await apiFetch(`/records/checkpoints?search=${encodeURIComponent(recordsSearch)}`);
            setCheckpoints(data.records);
          } else if (recordsTab === "weighbridges") {
            const data = await apiFetch(`/records/weighbridges?search=${encodeURIComponent(recordsSearch)}`);
            setWeighbridges(data.records);
          }
        } else if (currentNav === "import") {
          const history = await apiFetch("/imports");
          setImportHistory(history);
        } else if (currentNav === "reconciliation") {
          const runs = await apiFetch("/reconciliation/runs");
          setReconciliationRuns(runs);
        } else if (currentNav === "discrepancies") {
          const query = new URLSearchParams();
          if (discrepancyFilter.category) query.set("category", discrepancyFilter.category);
          if (discrepancyFilter.severity) query.set("severity", discrepancyFilter.severity);
          if (discrepancyFilter.status) query.set("status", discrepancyFilter.status);
          if (discrepancyFilter.search) query.set("search", discrepancyFilter.search);
          const data = await apiFetch(`/discrepancies?${query.toString()}`);
          setDiscrepancies(data.discrepancies);
        } else if (currentNav === "cases") {
          const data = await apiFetch("/cases");
          setComplianceCases(data.cases);
        } else if (currentNav === "evidence") {
          const data = await apiFetch("/evidence");
          setEvidenceList(data);
        } else if (currentNav === "analytics") {
          const [m, b] = await Promise.all([
            apiFetch("/analytics/overview"),
            apiFetch("/analytics/breakdown")
          ]);
          setOverviewMetrics(m);
          setAnalyticsBreakdown(b);
        } else if (currentNav === "audit") {
          const logs = await apiFetch("/audit-logs");
          setAuditLogs(logs);
        } else if (currentNav === "users" && currentUser?.role === "Administrator") {
          const users = await apiFetch("/users");
          setUsersList(users);
        } else if (currentNav === "settings") {
          const s = await apiFetch("/settings");
          setSettingsList(s);
        }
      } catch (err) {
        notify(err.message, "danger");
      }
    };

    loadData();
  }, [currentNav, token, recordsTab, recordsSearch, discrepancyFilter]);

  // -------------------------------------------------------------
  // ACTION HANDLERS
  // -------------------------------------------------------------

  // CSV Preview Handler
  const handlePreviewCsv = async (e) => {
    e.preventDefault();
    if (!importFile) return notify("Select a CSV file first.", "warning");

    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("source_type", importSourceType);

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/imports/preview`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportPreview(data);
      notify(`Preview generated: ${data.validRows} valid rows, ${data.invalidRows} errors.`);
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // CSV Import Confirmation Handler
  const handleConfirmImport = async () => {
    if (!importFile) return;
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("source_type", importSourceType);

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/imports`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      notify(`Successfully imported ${data.acceptedRows} ${importSourceType} records (Import #${data.importId})`);
      setImportFile(null);
      setImportPreview(null);
      const history = await apiFetch("/imports");
      setImportHistory(history);
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // Trigger Reconciliation Run
  const handleRunReconciliation = async () => {
    try {
      setLoading(true);
      const result = await apiFetch("/reconciliation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity_tolerance_pct: tolerancePct })
      });
      notify(`Reconciliation ${result.runCode} completed! Matched: ${result.totalMatched}, Discrepancies: ${result.discrepanciesFlagged}`);
      const runs = await apiFetch("/reconciliation/runs");
      setReconciliationRuns(runs);
      if (runs.length > 0) {
        const details = await apiFetch(`/reconciliation/runs/${runs[0].id}`);
        setSelectedRunDetails(details);
      }
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // View Discrepancy Detail
  const handleOpenDiscrepancy = async (id) => {
    try {
      const data = await apiFetch(`/discrepancies/${id}`);
      setSelectedDiscrepancy(data);
      setStatusUpdateForm({
        status: data.discrepancy.status,
        resolution_summary: data.discrepancy.resolution_summary || "",
        note_text: ""
      });
    } catch (err) {
      notify(err.message, "danger");
    }
  };

  // Update Discrepancy Status
  const handleUpdateDiscrepancy = async (e) => {
    e.preventDefault();
    if (!selectedDiscrepancy) return;
    try {
      const updated = await apiFetch(`/discrepancies/${selectedDiscrepancy.discrepancy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusUpdateForm)
      });
      notify(`Discrepancy status updated to ${updated.status}`);
      handleOpenDiscrepancy(selectedDiscrepancy.discrepancy.id);
      // Refresh list
      const data = await apiFetch("/discrepancies");
      setDiscrepancies(data.discrepancies);
    } catch (err) {
      notify(err.message, "danger");
    }
  };

  // Create Compliance Case
  const handleCreateCase = async (e) => {
    e.preventDefault();
    try {
      const created = await apiFetch("/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCaseForm)
      });
      notify(`Compliance Case ${created.case_code} created successfully.`);
      setCreateCaseModal(false);
      setNewCaseForm({ title: "", description: "", priority: "MEDIUM", discrepancy_ids: [] });
      const casesData = await apiFetch("/cases");
      setComplianceCases(casesData.cases);
    } catch (err) {
      notify(err.message, "danger");
    }
  };

  // Upload Evidence File
  const handleUploadEvidence = async (e) => {
    e.preventDefault();
    if (!evidenceFile) return notify("Please select an evidence file", "warning");

    const formData = new FormData();
    formData.append("file", evidenceFile);
    formData.append("description", evidenceDesc);

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/evidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify(`Evidence '${data.original_filename}' uploaded and verified (SHA-256: ${data.sha256_hash.slice(0, 10)}...)`);
      setEvidenceFile(null);
      setEvidenceDesc("");
      const list = await apiFetch("/evidence");
      setEvidenceList(list);
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // Verify Evidence SHA-256 Hash Integrity
  const handleVerifyEvidence = async (id) => {
    try {
      setLoading(true);
      const res = await apiFetch(`/evidence/${id}/verify`);
      if (res.integrityVerified) {
        notify(`✓ Integrity Verified: File hash matches on-disk SHA-256 (${res.storedHash.slice(0, 16)}...)`, "success");
      } else {
        notify(`⚠ TAMPER WARNING: Hash mismatch! Stored: ${res.storedHash}, Recalculated: ${res.recalculatedHash}`, "danger");
      }
    } catch (err) {
      notify(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // RENDER: LOGIN VIEW (if unauthenticated)
  // -------------------------------------------------------------
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", padding: "20px" }}>
        <div style={{ maxWidth: "440px", width: "100%", background: "#ffffff", borderRadius: "12px", padding: "32px", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5)" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ display: "inline-block", background: "#38bdf8", color: "#0f172a", fontWeight: "900", fontSize: "1.4rem", padding: "6px 14px", borderRadius: "8px", marginBottom: "8px" }}>
              MS
            </div>
            <h1 style={{ fontSize: "1.4rem", color: "#0f172a", margin: "4px 0" }}>MineShield</h1>
            <p style={{ fontSize: "0.82rem", color: "#64748b" }}>
              Mineral Transportation Record Reconciliation & Compliance Audit Platform
            </p>
          </div>

          {notification && (
            <div className={`alert alert-${notification.type}`} style={{ marginBottom: "16px" }}>
              {notification.msg}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                className="form-control"
                type="text"
                required
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                className="form-control"
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "12px" }} disabled={loading}>
              {loading ? "Authenticating..." : "Sign In to Platform"}
            </button>
          </form>

          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "0.8rem", color: "#64748b" }}>
            <p style={{ fontWeight: 600, marginBottom: "8px" }}>Development Accounts:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <button className="btn btn-outline btn-sm" onClick={() => handleQuickLogin("ComplianceReviewer")}>
                👤 Sign in as Compliance Reviewer (reviewer)
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleQuickLogin("Administrator")}>
                🛡️ Sign in as Administrator (admin)
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => handleQuickLogin("ReadOnlyAuditor")}>
                👁️ Sign in as Read-Only Auditor (auditor)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: AUTHENTICATED DASHBOARD
  // -------------------------------------------------------------
  return (
    <div className="app-layout">
      {/* 1. Primary Sidebar Navigation (11 views) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-badge">MS</div>
          <div>
            <div className="brand-title">MineShield</div>
            <div className="brand-subtitle">Reconciliation Platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${currentNav === "overview" ? "active" : ""}`} onClick={() => setCurrentNav("overview")}>
            📊 Overview
          </button>
          <button className={`nav-item ${currentNav === "records" ? "active" : ""}`} onClick={() => setCurrentNav("records")}>
            🚚 Transportation Records
          </button>
          <button className={`nav-item ${currentNav === "import" ? "active" : ""}`} onClick={() => setCurrentNav("import")}>
            📥 Import Data
          </button>
          <button className={`nav-item ${currentNav === "reconciliation" ? "active" : ""}`} onClick={() => setCurrentNav("reconciliation")}>
            ⚙️ Reconciliation
          </button>
          <button className={`nav-item ${currentNav === "discrepancies" ? "active" : ""}`} onClick={() => setCurrentNav("discrepancies")}>
            ⚠️ Discrepancies
          </button>
          <button className={`nav-item ${currentNav === "cases" ? "active" : ""}`} onClick={() => setCurrentNav("cases")}>
            📁 Compliance Cases
          </button>
          <button className={`nav-item ${currentNav === "evidence" ? "active" : ""}`} onClick={() => setCurrentNav("evidence")}>
            📎 Evidence
          </button>
          <button className={`nav-item ${currentNav === "analytics" ? "active" : ""}`} onClick={() => setCurrentNav("analytics")}>
            📈 Analytics & Reports
          </button>
          <button className={`nav-item ${currentNav === "audit" ? "active" : ""}`} onClick={() => setCurrentNav("audit")}>
            📜 Audit Logs
          </button>
          {currentUser.role === "Administrator" && (
            <button className={`nav-item ${currentNav === "users" ? "active" : ""}`} onClick={() => setCurrentNav("users")}>
              👥 User Management
            </button>
          )}
          <button className={`nav-item ${currentNav === "settings" ? "active" : ""}`} onClick={() => setCurrentNav("settings")}>
            🛠️ Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div>Logged in as:</div>
          <strong style={{ color: "#ffffff" }}>{currentUser.full_name}</strong>
          <div style={{ marginTop: "4px" }}>
            <span className="role-tag">{currentUser.role}</span>
          </div>
        </div>
      </aside>

      {/* 2. Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <header className="top-navbar">
          <div className="nav-breadcrumbs">
            <span>MineShield</span> / <strong>{currentNav.toUpperCase()}</strong>
          </div>

          <div className="user-controls">
            <div className="user-badge">
              <span>{currentUser.username}</span>
              <span className="role-tag">{currentUser.role}</span>
            </div>

            <select
              style={{ padding: "4px 8px", fontSize: "0.8rem", borderRadius: "4px", border: "1px solid var(--border)" }}
              value={currentUser.role}
              onChange={(e) => handleQuickLogin(e.target.value)}
            >
              <option value="ComplianceReviewer">Switch: Compliance Reviewer</option>
              <option value="Administrator">Switch: Administrator</option>
              <option value="ReadOnlyAuditor">Switch: Read-Only Auditor</option>
            </select>

            <a
              href="/MineShield_Project_Viva_Dossier.pdf"
              download="MineShield_Project_Viva_Dossier.pdf"
              className="btn btn-outline btn-sm"
              title="Download Complete Project Dossier & Viva Guide (PDF)"
              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              📄 Viva PDF Dossier
            </a>

            <button className="btn btn-outline btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {/* Global Notification Banner */}
        {notification && (
          <div style={{ margin: "16px 28px 0" }}>
            <div className={`alert alert-${notification.type}`}>
              <span>{notification.msg}</span>
              <button className="btn btn-sm btn-outline" onClick={() => setNotification(null)}>✕</button>
            </div>
          </div>
        )}

        {/* Content Container */}
        <main className="content-container">

          {/* ========================================================= */}
          {/* VIEW 1: OVERVIEW DASHBOARD                                 */}
          {/* ========================================================= */}
          {currentNav === "overview" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Operational Reconciliation Overview</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Multi-source data reconciliation status across permits, checkpoint events, and weighbridge scale measurements.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => setCurrentNav("reconciliation")}>
                  ⚡ Run Reconciliation
                </button>
              </div>

              {/* KPI Metric Cards */}
              <div className="metrics-grid">
                <div className="metric-card border-primary">
                  <span className="metric-label">Permits Imported</span>
                  <span className="metric-value">{overviewMetrics ? overviewMetrics.totalPermitRecords : "..."}</span>
                  <span className="metric-subtext">Authorized Mining Quota</span>
                </div>

                <div className="metric-card border-primary">
                  <span className="metric-label">Checkpoints Captured</span>
                  <span className="metric-value">{overviewMetrics ? overviewMetrics.totalCheckpointRecords : "..."}</span>
                  <span className="metric-subtext">RFID & Gate Observations</span>
                </div>

                <div className="metric-card border-primary">
                  <span className="metric-label">Weighbridges Weighed</span>
                  <span className="metric-value">{overviewMetrics ? overviewMetrics.totalWeighbridgeRecords : "..."}</span>
                  <span className="metric-subtext">Terminal Scale Measurements</span>
                </div>

                <div className="metric-card border-success">
                  <span className="metric-label">Match Rate</span>
                  <span className="metric-value" style={{ color: "var(--success)" }}>
                    {overviewMetrics ? `${overviewMetrics.matchRatePct}%` : "..."}
                  </span>
                  <span className="metric-subtext">
                    {overviewMetrics ? `${overviewMetrics.successfullyMatchedRecords} records verified` : "..."}
                  </span>
                </div>

                <div className="metric-card border-danger">
                  <span className="metric-label">Open Discrepancies</span>
                  <span className="metric-value" style={{ color: "var(--danger)" }}>
                    {overviewMetrics ? overviewMetrics.openDiscrepancies : "..."}
                  </span>
                  <span className="metric-subtext">
                    {overviewMetrics ? `${overviewMetrics.highPriorityDiscrepancies} High/Critical priority` : "..."}
                  </span>
                </div>

                <div className="metric-card border-warning">
                  <span className="metric-label">Compliance Cases</span>
                  <span className="metric-value">{overviewMetrics ? overviewMetrics.openComplianceCases : "..."}</span>
                  <span className="metric-subtext">
                    {overviewMetrics ? `${overviewMetrics.resolvedComplianceCases} resolved to date` : "..."}
                  </span>
                </div>
              </div>

              {/* Tonnage Reconciliation Overview */}
              {overviewMetrics && (
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">⚖️ Net Mineral Weight Comparison</span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Cumulative Imported Records</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Total Authorized Permit Tonnage:</div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{overviewMetrics.totalAuthorizedTons} Metric Tons</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Total Scale-Weighed Tonnage:</div>
                      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--primary)" }}>{overviewMetrics.totalWeighedTons} Metric Tons</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Discrepancy Breakdown by Category */}
              {analyticsBreakdown && (
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Flagged Discrepancies by Detection Category</span>
                    <button className="btn btn-outline btn-sm" onClick={() => setCurrentNav("discrepancies")}>
                      View Discrepancy Register →
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
                    {analyticsBreakdown.byCategory.map((cat) => (
                      <div key={cat.category} style={{ background: "#f8fafc", padding: "12px 14px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 600, fontSize: "0.82rem" }}>{cat.category.replace(/_/g, " ")}</span>
                          <span style={{ fontWeight: 700, color: "var(--primary)" }}>{cat.count}</span>
                        </div>
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${Math.min(100, (cat.count / 10) * 100)}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: TRANSPORTATION RECORDS                              */}
          {/* ========================================================= */}
          {currentNav === "records" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Normalized Transportation Records</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Multi-source operational dataset loaded from regulatory portals, checkposts, and weighbridge systems.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className={`btn ${recordsTab === "permits" ? "btn-primary" : "btn-outline"}`} onClick={() => setRecordsTab("permits")}>
                    Permits ({permits.length})
                  </button>
                  <button className={`btn ${recordsTab === "checkpoints" ? "btn-primary" : "btn-outline"}`} onClick={() => setRecordsTab("checkpoints")}>
                    Checkpoints ({checkpoints.length})
                  </button>
                  <button className={`btn ${recordsTab === "weighbridges" ? "btn-primary" : "btn-outline"}`} onClick={() => setRecordsTab("weighbridges")}>
                    Weighbridges ({weighbridges.length})
                  </button>
                </div>
              </div>

              {/* Filter */}
              <div className="filter-bar">
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search by permit code, vehicle number, or station..."
                  value={recordsSearch}
                  onChange={(e) => setRecordsSearch(e.target.value)}
                />
              </div>

              {/* Permits Table */}
              {recordsTab === "permits" && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Permit Number</th>
                        <th>Vehicle No</th>
                        <th>Mineral</th>
                        <th>Authorized Qty</th>
                        <th>Origin</th>
                        <th>Destination</th>
                        <th>Issue Timestamp</th>
                        <th>Source System</th>
                      </tr>
                    </thead>
                    <tbody>
                      {permits.length > 0 ? (
                        permits.map((p) => (
                          <tr key={p.id}>
                            <td><strong>{p.source_permit_no}</strong></td>
                            <td><code>{p.vehicle_no}</code></td>
                            <td>{p.mineral_type}</td>
                            <td><strong>{p.authorized_quantity} Tons</strong></td>
                            <td>{p.origin}</td>
                            <td>{p.destination}</td>
                            <td>{p.issue_timestamp ? new Date(p.issue_timestamp).toLocaleString() : "-"}</td>
                            <td><span className="badge badge-low">{p.source_system}</span></td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="8" className="empty-state">No permit records found. Use the Import Data module to upload CSV files.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Checkpoints Table */}
              {recordsTab === "checkpoints" && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Event ID</th>
                        <th>Permit Ref</th>
                        <th>Vehicle No</th>
                        <th>Checkpoint Station</th>
                        <th>Event Timestamp</th>
                        <th>Direction</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkpoints.length > 0 ? (
                        checkpoints.map((c) => (
                          <tr key={c.id}>
                            <td><strong>{c.source_event_id}</strong></td>
                            <td>{c.permit_no ? <strong>{c.permit_no}</strong> : <span style={{ color: "var(--danger)" }}>[BLANK]</span>}</td>
                            <td><code>{c.vehicle_no}</code></td>
                            <td>{c.checkpoint_name}</td>
                            <td>{new Date(c.event_timestamp).toLocaleString()}</td>
                            <td>{c.direction}</td>
                            <td><span className="badge badge-low">{c.source_system}</span></td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="7" className="empty-state">No checkpoint records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Weighbridges Table */}
              {recordsTab === "weighbridges" && (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Transaction ID</th>
                        <th>Permit Ref</th>
                        <th>Vehicle No</th>
                        <th>Weighbridge ID</th>
                        <th>Gross Weight</th>
                        <th>Tare Weight</th>
                        <th>Net Weight</th>
                        <th>Measured At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weighbridges.length > 0 ? (
                        weighbridges.map((w) => (
                          <tr key={w.id}>
                            <td><strong>{w.source_transaction_id}</strong></td>
                            <td>{w.permit_no ? <strong>{w.permit_no}</strong> : "-"}</td>
                            <td><code>{w.vehicle_no}</code></td>
                            <td>{w.weighbridge_id}</td>
                            <td>{w.gross_weight ? `${w.gross_weight} T` : "-"}</td>
                            <td>{w.tare_weight ? `${w.tare_weight} T` : "-"}</td>
                            <td><strong style={{ color: "var(--primary)" }}>{w.net_weight} Tons</strong></td>
                            <td>{new Date(w.measurement_timestamp).toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="8" className="empty-state">No weighbridge records found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 3: IMPORT DATA (10-STEP WORKFLOW)                      */}
          {/* ========================================================= */}
          {currentNav === "import" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Operational Data Import Pipeline</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Upload CSV records from permits portals, checkpoint RFID posts, and weighbridge terminals.
                  </p>
                </div>
              </div>

              {/* Step 1 to 5: Select, Upload, Preview, Map */}
              <div className="panel">
                <span className="panel-title">1. Upload & Validate Source CSV</span>
                <form onSubmit={handlePreviewCsv} style={{ marginTop: "16px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", marginBottom: "16px" }}>
                    <div className="form-group">
                      <label>Target Operational Data Source:</label>
                      <select
                        className="form-control"
                        value={importSourceType}
                        onChange={(e) => {
                          setImportSourceType(e.target.value);
                          setImportPreview(null);
                        }}
                      >
                        <option value="PERMIT">Permit Records (Mining Portal)</option>
                        <option value="CHECKPOINT">Checkpoint Records (Surveillance / RFID)</option>
                        <option value="WEIGHBRIDGE">Weighbridge Records (Scale Measurement)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Select CSV File from Disk:</label>
                      <input
                        type="file"
                        accept=".csv"
                        className="form-control"
                        onChange={(e) => {
                          setImportFile(e.target.files[0]);
                          setImportPreview(null);
                        }}
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn btn-outline" disabled={loading || !importFile}>
                    {loading ? "Validating & Parsing Headers..." : "🔍 Inspect & Preview CSV Structure"}
                  </button>
                </form>

                {/* Import Preview & Column Mapping Breakdown */}
                {importPreview && (
                  <div style={{ marginTop: "20px", background: "#f8fafc", padding: "18px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                      <strong>Preview & Validation Outcome:</strong>
                      <div>
                        <span className="badge badge-resolved" style={{ marginRight: "8px" }}>
                          {importPreview.validRows} Valid Rows
                        </span>
                        {importPreview.invalidRows > 0 && (
                          <span className="badge badge-critical">
                            {importPreview.invalidRows} Rows with Validation Errors
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                      Detected Columns: {importPreview.availableColumns.join(", ")}
                    </div>

                    {/* Sample preview table */}
                    <div className="table-wrapper" style={{ marginBottom: "16px" }}>
                      <table>
                        <thead>
                          <tr>
                            {importPreview.availableColumns.slice(0, 6).map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.previewRows.map((row, idx) => (
                            <tr key={idx}>
                              {importPreview.availableColumns.slice(0, 6).map((c) => (
                                <td key={c}>{row[c] || "-"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Sample errors if any */}
                    {importPreview.sampleErrors.length > 0 && (
                      <div style={{ background: "#fee2e2", padding: "12px", borderRadius: "6px", marginBottom: "16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--danger)", fontSize: "0.85rem", marginBottom: "6px" }}>
                          Sample Row Validation Errors (These rows will be rejected):
                        </div>
                        {importPreview.sampleErrors.map((err, i) => (
                          <div key={i} style={{ fontSize: "0.8rem", color: "#991b1b" }}>
                            • Row #{err.row}: {err.error}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: "12px" }}>
                      <button className="btn btn-success" onClick={handleConfirmImport} disabled={loading}>
                        ✔ Confirm & Commit Import ({importPreview.validRows} rows)
                      </button>
                      <button className="btn btn-outline" onClick={() => setImportPreview(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Import History Table */}
              <div className="panel">
                <span className="panel-title">Batch Import History & Audit Log</span>
                <div className="table-wrapper" style={{ marginTop: "14px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Import ID</th>
                        <th>Source Type</th>
                        <th>Filename</th>
                        <th>Total Rows</th>
                        <th>Accepted</th>
                        <th>Rejected</th>
                        <th>Status</th>
                        <th>Uploaded By</th>
                        <th>Timestamp</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importHistory.length > 0 ? (
                        importHistory.map((h) => (
                          <tr key={h.id}>
                            <td>#{h.id}</td>
                            <td><span className="badge badge-low">{h.source_type}</span></td>
                            <td>{h.file_name}</td>
                            <td>{h.total_rows}</td>
                            <td><span style={{ color: "var(--success)", fontWeight: 600 }}>{h.accepted_rows}</span></td>
                            <td>
                              {h.rejected_rows > 0 ? (
                                <span style={{ color: "var(--danger)", fontWeight: 600 }}>{h.rejected_rows}</span>
                              ) : (
                                "0"
                              )}
                            </td>
                            <td>
                              <span className={`badge ${h.status === "COMPLETED" ? "badge-resolved" : h.status === "PARTIAL" ? "badge-medium" : "badge-critical"}`}>
                                {h.status}
                              </span>
                            </td>
                            <td>{h.uploader_name || "System"}</td>
                            <td>{new Date(h.created_at).toLocaleString()}</td>
                            <td>
                              {h.rejected_rows > 0 && (
                                <a
                                  href={`${API_BASE}/imports/${h.id}/errors/csv`}
                                  className="btn btn-outline btn-sm"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Download Errors CSV
                                </a>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="10" className="empty-state">No import runs logged.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 4: RECONCILIATION ENGINE                              */}
          {/* ========================================================= */}
          {currentNav === "reconciliation" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Reconciliation Engine</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Multi-source record matching and anomaly detection across permits, checkpoints, and weighbridges.
                  </p>
                </div>
              </div>

              {/* Run controls */}
              <div className="panel">
                <span className="panel-title">Execute Automated Reconciliation</span>
                <div style={{ display: "flex", gap: "20px", alignItems: "center", marginTop: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>Quantity Tolerance Threshold:</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      className="form-control"
                      style={{ width: "90px" }}
                      value={tolerancePct}
                      onChange={(e) => setTolerancePct(parseFloat(e.target.value))}
                    />
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>%</span>
                  </div>

                  <button className="btn btn-primary" onClick={handleRunReconciliation} disabled={loading}>
                    {loading ? "Matching & Evaluating Rules..." : "🚀 Run Reconciliation Engine"}
                  </button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "8px" }}>
                  Idempotent execution: Detects quantity variances exceeding {tolerancePct}%, missing checkpoints, missing weighbridges, vehicle mismatches, duplicates, and ambiguous candidates.
                </p>
              </div>

              {/* Past Reconciliation Runs */}
              <div className="panel">
                <span className="panel-title">Reconciliation Execution History</span>
                <div className="table-wrapper" style={{ marginTop: "14px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Run Code</th>
                        <th>Initiated By</th>
                        <th>Tolerance</th>
                        <th>Processed</th>
                        <th>Matched</th>
                        <th>Unmatched</th>
                        <th>Discrepancies</th>
                        <th>Executed At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationRuns.length > 0 ? (
                        reconciliationRuns.map((r) => (
                          <tr key={r.id}>
                            <td><strong>{r.run_code}</strong></td>
                            <td>{r.initiator_name || "System"}</td>
                            <td>{r.quantity_tolerance_pct}%</td>
                            <td>{r.total_permits_processed}</td>
                            <td><span className="badge badge-exact">{r.total_matched} Matched</span></td>
                            <td>{r.total_unmatched > 0 ? <span className="badge badge-unmatched">{r.total_unmatched} Unmatched</span> : "0"}</td>
                            <td><span className="badge badge-critical">{r.discrepancies_flagged} Flagged</span></td>
                            <td>{new Date(r.started_at).toLocaleString()}</td>
                            <td>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={async () => {
                                  const details = await apiFetch(`/reconciliation/runs/${r.id}`);
                                  setSelectedRunDetails(details);
                                }}
                              >
                                View Matches & Log
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="9" className="empty-state">No reconciliation runs executed yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Selected Run Matches Table */}
              {selectedRunDetails && (
                <div className="panel">
                  <div className="panel-header">
                    <span className="panel-title">
                      Matched Transportation Links ({selectedRunDetails.run.run_code})
                    </span>
                    <button className="btn btn-outline btn-sm" onClick={() => setSelectedRunDetails(null)}>
                      Close Details
                    </button>
                  </div>

                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th>Permit Code</th>
                          <th>Authorized Qty</th>
                          <th>Checkpoint Station</th>
                          <th>Weighbridge ID</th>
                          <th>Weighed Qty</th>
                          <th>Match Classification</th>
                          <th>Confidence</th>
                          <th>Matching Criteria</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRunDetails.matches.map((m) => (
                          <tr key={m.id}>
                            <td><strong>{m.source_permit_no || "Unlinked"}</strong></td>
                            <td>{m.authorized_quantity ? `${m.authorized_quantity} T` : "-"}</td>
                            <td>{m.checkpoint_name || <span style={{ color: "var(--danger)" }}>Missing</span>}</td>
                            <td>{m.weighbridge_id || <span style={{ color: "var(--danger)" }}>Missing</span>}</td>
                            <td>{m.net_weight ? `${m.net_weight} T` : "-"}</td>
                            <td>
                              <span className={`badge badge-${m.match_type.toLowerCase()}`}>
                                {m.match_type}
                              </span>
                            </td>
                            <td>{(m.match_confidence * 100).toFixed(0)}%</td>
                            <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{m.match_criteria}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 5: DISCREPANCY MANAGEMENT                              */}
          {/* ========================================================= */}
          {currentNav === "discrepancies" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Discrepancy Investigation Register</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Flagged operational data anomalies requiring human compliance review and decision.
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="filter-bar">
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search code, permit, or title..."
                  value={discrepancyFilter.search}
                  onChange={(e) => setDiscrepancyFilter({ ...discrepancyFilter, search: e.target.value })}
                />

                <select
                  className="filter-select"
                  value={discrepancyFilter.category}
                  onChange={(e) => setDiscrepancyFilter({ ...discrepancyFilter, category: e.target.value })}
                >
                  <option value="">All Categories</option>
                  <option value="QUANTITY_MISMATCH">Quantity Mismatch</option>
                  <option value="MISSING_CHECKPOINT">Missing Checkpoint</option>
                  <option value="MISSING_WEIGHBRIDGE">Missing Weighbridge</option>
                  <option value="VEHICLE_MISMATCH">Vehicle Mismatch</option>
                  <option value="DUPLICATE_RECORD">Duplicate Record</option>
                  <option value="INCOMPLETE_RECORD">Incomplete Record</option>
                  <option value="AMBIGUOUS_MATCH">Ambiguous Match</option>
                </select>

                <select
                  className="filter-select"
                  value={discrepancyFilter.severity}
                  onChange={(e) => setDiscrepancyFilter({ ...discrepancyFilter, severity: e.target.value })}
                >
                  <option value="">All Severities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>

                <select
                  className="filter-select"
                  value={discrepancyFilter.status}
                  onChange={(e) => setDiscrepancyFilter({ ...discrepancyFilter, status: e.target.value })}
                >
                  <option value="">All Statuses</option>
                  <option value="NEW">New</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="AWAITING_EVIDENCE">Awaiting Evidence</option>
                  <option value="ESCALATED">Escalated</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>
              </div>

              {/* Discrepancies Table */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Category</th>
                      <th>Severity</th>
                      <th>Permit Ref</th>
                      <th>Vehicle</th>
                      <th>Summary</th>
                      <th>Expected vs Observed</th>
                      <th>Status</th>
                      <th>Assigned To</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discrepancies.length > 0 ? (
                      discrepancies.map((d) => (
                        <tr key={d.id}>
                          <td><strong>{d.discrepancy_code}</strong></td>
                          <td><span className="badge badge-low">{d.category.replace(/_/g, " ")}</span></td>
                          <td><span className={`badge badge-${d.severity.toLowerCase()}`}>{d.severity}</span></td>
                          <td>{d.source_permit_no ? <strong>{d.source_permit_no}</strong> : "-"}</td>
                          <td><code>{d.permit_vehicle || d.checkpoint_vehicle || d.weighbridge_vehicle || "-"}</code></td>
                          <td style={{ maxWidth: "240px", fontSize: "0.82rem" }}>{d.title}</td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                            Exp: {d.expected_value || "-"}<br />Obs: {d.observed_value || "-"}
                          </td>
                          <td><span className={`badge badge-${d.status.toLowerCase().replace(/_/g, "-")}`}>{d.status}</span></td>
                          <td>{d.assigned_to_name || <span style={{ color: "var(--text-light)" }}>Unassigned</span>}</td>
                          <td>
                            <button className="btn btn-outline btn-sm" onClick={() => handleOpenDiscrepancy(d.id)}>
                              Investigate
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="10" className="empty-state">No discrepancies match the active filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Discrepancy Detail Drawer/Modal */}
              {selectedDiscrepancy && (
                <div className="modal-overlay" onClick={() => setSelectedDiscrepancy(null)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)", paddingBottom: "12px", marginBottom: "16px" }}>
                      <div>
                        <h2 style={{ fontSize: "1.2rem", margin: 0 }}>
                          {selectedDiscrepancy.discrepancy.discrepancy_code}: {selectedDiscrepancy.discrepancy.title}
                        </h2>
                        <span className={`badge badge-${selectedDiscrepancy.discrepancy.severity.toLowerCase()}`} style={{ marginRight: "8px" }}>
                          {selectedDiscrepancy.discrepancy.severity}
                        </span>
                        <span className="badge badge-low">{selectedDiscrepancy.discrepancy.category}</span>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={() => setSelectedDiscrepancy(null)}>✕</button>
                    </div>

                    <p style={{ fontSize: "0.88rem", background: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                      <strong>Detection Rule Explanation:</strong> {selectedDiscrepancy.discrepancy.explanation}
                    </p>

                    {/* Side-by-Side Source Comparison */}
                    <div className="comparison-grid">
                      <div className="source-box">
                        <div className="source-box-title">📄 Permit Record</div>
                        {selectedDiscrepancy.sources.permit ? (
                          <>
                            <div className="field-pair"><span className="field-label">Permit:</span><span className="field-val">{selectedDiscrepancy.sources.permit.source_permit_no}</span></div>
                            <div className="field-pair"><span className="field-label">Vehicle:</span><span className="field-val">{selectedDiscrepancy.sources.permit.vehicle_no}</span></div>
                            <div className="field-pair"><span className="field-label">Quantity:</span><span className="field-val">{selectedDiscrepancy.sources.permit.authorized_quantity} Tons</span></div>
                            <div className="field-pair"><span className="field-label">Origin:</span><span className="field-val">{selectedDiscrepancy.sources.permit.origin}</span></div>
                          </>
                        ) : (
                          <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>No matching permit found.</div>
                        )}
                      </div>

                      <div className="source-box">
                        <div className="source-box-title">🛡️ Checkpoint Observation</div>
                        {selectedDiscrepancy.sources.checkpoint ? (
                          <>
                            <div className="field-pair"><span className="field-label">Event ID:</span><span className="field-val">{selectedDiscrepancy.sources.checkpoint.source_event_id}</span></div>
                            <div className="field-pair"><span className="field-label">Station:</span><span className="field-val">{selectedDiscrepancy.sources.checkpoint.checkpoint_name}</span></div>
                            <div className="field-pair"><span className="field-label">Vehicle:</span><span className="field-val">{selectedDiscrepancy.sources.checkpoint.vehicle_no}</span></div>
                            <div className="field-pair"><span className="field-label">Timestamp:</span><span className="field-val">{new Date(selectedDiscrepancy.sources.checkpoint.event_timestamp).toLocaleTimeString()}</span></div>
                          </>
                        ) : (
                          <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>No checkpoint observation recorded.</div>
                        )}
                      </div>

                      <div className="source-box">
                        <div className="source-box-title">⚖️ Weighbridge Scale</div>
                        {selectedDiscrepancy.sources.weighbridge ? (
                          <>
                            <div className="field-pair"><span className="field-label">Ticket ID:</span><span className="field-val">{selectedDiscrepancy.sources.weighbridge.source_transaction_id}</span></div>
                            <div className="field-pair"><span className="field-label">Weighbridge:</span><span className="field-val">{selectedDiscrepancy.sources.weighbridge.weighbridge_id}</span></div>
                            <div className="field-pair"><span className="field-label">Net Weight:</span><span className="field-val">{selectedDiscrepancy.sources.weighbridge.net_weight} Tons</span></div>
                            <div className="field-pair"><span className="field-label">Vehicle:</span><span className="field-val">{selectedDiscrepancy.sources.weighbridge.vehicle_no}</span></div>
                          </>
                        ) : (
                          <div style={{ color: "var(--danger)", fontSize: "0.8rem" }}>No weighbridge record found.</div>
                        )}
                      </div>
                    </div>

                    {/* Investigation Notes History */}
                    <div style={{ marginTop: "16px", marginBottom: "16px" }}>
                      <strong style={{ fontSize: "0.85rem" }}>Investigation Notes Trail:</strong>
                      {selectedDiscrepancy.notes.length > 0 ? (
                        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                          {selectedDiscrepancy.notes.map((n) => (
                            <div key={n.id} style={{ background: "#f8fafc", padding: "8px 12px", borderRadius: "6px", fontSize: "0.82rem", border: "1px solid var(--border)" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)", marginBottom: "4px" }}>
                                <span>{n.author_name} ({n.author_role})</span>
                                <span>{new Date(n.created_at).toLocaleString()}</span>
                              </div>
                              <div>{n.note_text}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>No investigation notes logged yet.</div>
                      )}
                    </div>

                    {/* Status Update & Resolution Form */}
                    <form onSubmit={handleUpdateDiscrepancy} style={{ borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", marginBottom: "10px" }}>
                        <div className="form-group">
                          <label>Update Status:</label>
                          <select
                            className="form-control"
                            value={statusUpdateForm.status}
                            onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, status: e.target.value })}
                          >
                            <option value="NEW">New</option>
                            <option value="UNDER_REVIEW">Under Review</option>
                            <option value="AWAITING_EVIDENCE">Awaiting Evidence</option>
                            <option value="ESCALATED">Escalated</option>
                            <option value="RESOLVED">Resolved (Requires explanation)</option>
                            <option value="DISMISSED">Dismissed (Requires explanation)</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Add Investigation Note / Resolution Summary:</label>
                          <input
                            type="text"
                            className="form-control"
                            required={["RESOLVED", "DISMISSED"].includes(statusUpdateForm.status)}
                            placeholder="Document investigation findings or reason for resolution..."
                            value={statusUpdateForm.resolution_summary}
                            onChange={(e) => setStatusUpdateForm({ ...statusUpdateForm, resolution_summary: e.target.value })}
                          />
                        </div>
                      </div>

                      <button type="submit" className="btn btn-primary" disabled={currentUser.role === "ReadOnlyAuditor"}>
                        Save Investigation Update
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 6: COMPLIANCE CASES                                   */}
          {/* ========================================================= */}
          {currentNav === "cases" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Compliance Cases Management</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Structured investigation files grouping related discrepancies for reviewer decision.
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setCreateCaseModal(true)}
                  disabled={currentUser.role === "ReadOnlyAuditor"}
                >
                  + Create Compliance Case
                </button>
              </div>

              {/* Cases Table */}
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Case Code</th>
                      <th>Title</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Linked Discrepancies</th>
                      <th>Assigned Reviewer</th>
                      <th>Created By</th>
                      <th>Created At</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceCases.length > 0 ? (
                      complianceCases.map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.case_code}</strong></td>
                          <td><strong>{c.title}</strong></td>
                          <td><span className={`badge badge-${c.priority.toLowerCase()}`}>{c.priority}</span></td>
                          <td><span className={`badge badge-${c.status.toLowerCase().replace(/_/g, "-")}`}>{c.status}</span></td>
                          <td><span className="badge badge-low">{c.linked_discrepancies_count || 0} items</span></td>
                          <td>{c.assigned_to_name || "Unassigned"}</td>
                          <td>{c.created_by_name || "System"}</td>
                          <td>{new Date(c.created_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={async () => {
                                const detail = await apiFetch(`/cases/${c.id}`);
                                setSelectedCase(detail);
                              }}
                            >
                              View Case
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="9" className="empty-state">No compliance cases logged yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Create Case Modal */}
              {createCaseModal && (
                <div className="modal-overlay" onClick={() => setCreateCaseModal(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="panel-header">
                      <span className="panel-title">Create Formal Compliance Case</span>
                      <button className="btn btn-outline btn-sm" onClick={() => setCreateCaseModal(false)}>✕</button>
                    </div>

                    <form onSubmit={handleCreateCase}>
                      <div className="form-group">
                        <label>Case Title:</label>
                        <input
                          type="text"
                          required
                          className="form-control"
                          placeholder="e.g. Investigation into Quarry Over-Tonnage Patterns"
                          value={newCaseForm.title}
                          onChange={(e) => setNewCaseForm({ ...newCaseForm, title: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label>Description:</label>
                        <textarea
                          rows="3"
                          required
                          className="form-control"
                          placeholder="Summary of operational anomalies and audit objectives..."
                          value={newCaseForm.description}
                          onChange={(e) => setNewCaseForm({ ...newCaseForm, description: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label>Priority:</label>
                        <select
                          className="form-control"
                          value={newCaseForm.priority}
                          onChange={(e) => setNewCaseForm({ ...newCaseForm, priority: e.target.value })}
                        >
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>

                      <button type="submit" className="btn btn-primary" style={{ marginTop: "12px" }}>
                        Create Case File
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Case Detail Modal */}
              {selectedCase && (
                <div className="modal-overlay" onClick={() => setSelectedCase(null)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "750px" }}>
                    <div className="panel-header">
                      <div>
                        <h2 style={{ fontSize: "1.2rem", margin: 0 }}>{selectedCase.caseRecord.case_code}: {selectedCase.caseRecord.title}</h2>
                        <span className={`badge badge-${selectedCase.caseRecord.status.toLowerCase().replace(/_/g, "-")}`} style={{ marginRight: "8px" }}>
                          {selectedCase.caseRecord.status}
                        </span>
                        <span className={`badge badge-${selectedCase.caseRecord.priority.toLowerCase()}`}>{selectedCase.caseRecord.priority}</span>
                      </div>
                      <button className="btn btn-outline btn-sm" onClick={() => setSelectedCase(null)}>✕</button>
                    </div>

                    <p style={{ fontSize: "0.9rem", color: "var(--text-main)" }}>{selectedCase.caseRecord.description}</p>

                    <div style={{ marginTop: "16px" }}>
                      <strong style={{ fontSize: "0.85rem" }}>Linked Discrepancies ({selectedCase.discrepancies.length}):</strong>
                      <div className="table-wrapper" style={{ marginTop: "8px" }}>
                        <table>
                          <thead>
                            <tr>
                              <th>Code</th>
                              <th>Category</th>
                              <th>Permit</th>
                              <th>Vehicle</th>
                              <th>Summary</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedCase.discrepancies.map((d) => (
                              <tr key={d.id}>
                                <td><strong>{d.discrepancy_code}</strong></td>
                                <td><span className="badge badge-low">{d.category}</span></td>
                                <td>{d.source_permit_no || "-"}</td>
                                <td><code>{d.permit_vehicle || "-"}</code></td>
                                <td style={{ fontSize: "0.8rem" }}>{d.title}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 7: EVIDENCE MANAGEMENT                                */}
          {/* ========================================================= */}
          {currentNav === "evidence" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Evidence & Attachment Repository</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Supporting documents, calibration certificates, scale slips, and survey maps with cryptographic SHA-256 integrity verification.
                  </p>
                </div>
              </div>

              {/* Upload form */}
              {currentUser.role !== "ReadOnlyAuditor" && (
                <div className="panel">
                  <span className="panel-title">Upload Supporting Evidence</span>
                  <form onSubmit={handleUploadEvidence} style={{ marginTop: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", marginBottom: "12px" }}>
                      <div className="form-group">
                        <label>Select File (PDF, PNG, JPG, CSV):</label>
                        <input
                          type="file"
                          className="form-control"
                          required
                          onChange={(e) => setEvidenceFile(e.target.files[0])}
                        />
                      </div>

                      <div className="form-group">
                        <label>Description & Audit Purpose:</label>
                        <input
                          type="text"
                          className="form-control"
                          required
                          placeholder="e.g. Weighbridge calibration certificate from certified inspector"
                          value={evidenceDesc}
                          onChange={(e) => setEvidenceDesc(e.target.value)}
                        />
                      </div>
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? "Uploading & Hashing..." : "Upload Evidence"}
                    </button>
                  </form>
                </div>
              )}

              {/* Evidence Table */}
              <div className="panel">
                <span className="panel-title">Stored Evidence Files</span>
                <div className="table-wrapper" style={{ marginTop: "14px" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Evidence ID</th>
                        <th>Filename</th>
                        <th>Type</th>
                        <th>Size</th>
                        <th>SHA-256 Integrity Hash</th>
                        <th>Description</th>
                        <th>Uploaded By</th>
                        <th>Upload Timestamp</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceList.length > 0 ? (
                        evidenceList.map((e) => (
                          <tr key={e.id}>
                            <td>#{e.id}</td>
                            <td><strong>{e.original_filename}</strong></td>
                            <td><span className="badge badge-low">{e.file_type}</span></td>
                            <td>{(e.file_size / 1024).toFixed(1)} KB</td>
                            <td><code>{e.sha256_hash ? e.sha256_hash.slice(0, 16) + "..." : "-"}</code></td>
                            <td style={{ fontSize: "0.82rem" }}>{e.description || "-"}</td>
                            <td>{e.uploader_name || "System"}</td>
                            <td>{new Date(e.created_at).toLocaleString()}</td>
                            <td style={{ display: "flex", gap: "6px" }}>
                              <a
                                href={`${API_BASE}/evidence/${e.id}/download`}
                                className="btn btn-outline btn-sm"
                                target="_blank"
                                rel="noreferrer"
                              >
                                ⬇ Download
                              </a>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => handleVerifyEvidence(e.id)}
                                title="Recalculate SHA-256 integrity hash from disk storage"
                              >
                                🛡️ Verify Hash
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan="9" className="empty-state">No evidence files uploaded yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 8: ANALYTICS & REPORTS                                */}
          {/* ========================================================= */}
          {currentNav === "analytics" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Compliance Analytics & Export</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Calculated trends, match rates, and downloadable CSV audit reports.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <a href={`${API_BASE}/analytics/export/csv?type=discrepancies`} className="btn btn-primary btn-sm">
                    Export Discrepancies CSV
                  </a>
                  <a href={`${API_BASE}/analytics/export/csv?type=cases`} className="btn btn-outline btn-sm">
                    Export Cases CSV
                  </a>
                </div>
              </div>

              {overviewMetrics && (
                <div className="metrics-grid">
                  <div className="metric-card border-success">
                    <span className="metric-label">Reconciliation Match Rate</span>
                    <span className="metric-value">{overviewMetrics.matchRatePct}%</span>
                    <span className="metric-subtext">Across {overviewMetrics.totalPermitRecords} permit records</span>
                  </div>

                  <div className="metric-card border-danger">
                    <span className="metric-label">Total Discrepancies Flagged</span>
                    <span className="metric-value">{overviewMetrics.totalDiscrepancies}</span>
                    <span className="metric-subtext">{overviewMetrics.resolvedDiscrepancies} resolved by review</span>
                  </div>

                  <div className="metric-card border-primary">
                    <span className="metric-label">Reconciliation Runs</span>
                    <span className="metric-value">{overviewMetrics.totalReconciliationRuns}</span>
                    <span className="metric-subtext">Automated checks</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 9: AUDIT LOGS                                         */}
          {/* ========================================================= */}
          {currentNav === "audit" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>System Audit Ledger</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Tamper-evident activity trail recording operational imports, reconciliation executions, reviewer decisions, and evidence access.
                  </p>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Event ID</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Resource Type</th>
                      <th>Resource ID</th>
                      <th>Outcome</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length > 0 ? (
                      auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td>#{log.id}</td>
                          <td><strong>{log.actor_username}</strong></td>
                          <td><code>{log.action}</code></td>
                          <td>{log.resource_type}</td>
                          <td>{log.resource_id || "-"}</td>
                          <td>
                            <span className={`badge ${log.outcome === "SUCCESS" ? "badge-resolved" : "badge-critical"}`}>
                              {log.outcome}
                            </span>
                          </td>
                          <td>{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="7" className="empty-state">No audit logs recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 10: USER MANAGEMENT (Admin only)                       */}
          {/* ========================================================= */}
          {currentNav === "users" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>User & Access Management</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Role-based access control for compliance personnel and external audit observers.
                  </p>
                </div>
              </div>

              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Username</th>
                      <th>Full Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersList.map((u) => (
                      <tr key={u.id}>
                        <td>#{u.id}</td>
                        <td><strong>{u.username}</strong></td>
                        <td>{u.full_name}</td>
                        <td>{u.email}</td>
                        <td><span className="role-tag">{u.role}</span></td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* VIEW 11: SETTINGS & ARCHITECTURE                           */}
          {/* ========================================================= */}
          {currentNav === "settings" && (
            <div>
              <div className="panel-header">
                <div>
                  <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Platform Configuration & Cloud Architecture</h1>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Reconciliation parameters, cloud storage adapters, and database engine status.
                  </p>
                </div>
              </div>

              <div className="panel">
                <span className="panel-title">Active Database & Storage Adapters</span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "14px" }}>
                  <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600, marginBottom: "6px" }}>Relational Database Engine:</div>
                    <div>Active Provider: <strong>SQLite3 (Local Development ACID Engine)</strong></div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Target Production Provider: Azure SQL Database (`mssql` adapter configured).
                    </div>
                  </div>

                  <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600, marginBottom: "6px" }}>File & Evidence Storage:</div>
                    <div>Active Provider: <strong>Local Disk Storage Adapter (`/uploads`)</strong></div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                      Target Production Provider: Azure Blob Storage (`@azure/storage-blob` ready).
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}

export default App;
