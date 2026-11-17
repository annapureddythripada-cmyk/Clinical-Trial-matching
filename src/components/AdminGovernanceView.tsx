import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  AuditLogEntry,
  UserAccount,
  UserRole,
  WorkspacePolicy,
} from '../types/clinical';

interface AdminGovernanceViewProps {
  currentUser: UserAccount;
  policy: WorkspacePolicy;
  onWorkspaceDataChanged: () => Promise<void>;
}

export function AdminGovernanceView({
  currentUser,
  policy,
  onWorkspaceDataChanged,
}: AdminGovernanceViewProps) {
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentUser.role === 'ADMINISTRATOR';

  async function fetchAdminData() {
    setLoading(true);
    try {
      const logRes = await api.listAuditLogs();
      setAuditLogs(logRes.logs);
      if (isAdmin) {
        const userRes = await api.listUsers();
        setUsers(userRes.users);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load governance records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAdminData();
  }, [currentUser.role]);

  async function handleTogglePolicy(key: keyof WorkspacePolicy, val: boolean) {
    setError(null);
    setNotice(null);
    try {
      await api.updatePolicy({ [key]: val });
      await onWorkspaceDataChanged();
      await fetchAdminData();
      setNotice('Updated workspace AI & governance policy.');
    } catch (err: any) {
      setError(err.message || 'Policy update failed.');
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    setError(null);
    try {
      await api.updateUserRole(userId, role);
      await fetchAdminData();
      setNotice('Updated user workspace role.');
    } catch (err: any) {
      setError(err.message || 'Failed to update role.');
    }
  }

  async function handleLoadDemo() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.loadDemoData();
      await onWorkspaceDataChanged();
      await fetchAdminData();
      setNotice('Loaded 5 sample trials, 4 synthetic patient profiles, and pre-screening examples.');
    } catch (err: any) {
      setError(err.message || 'Failed to load demo data.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRunDemoMatching() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.runDemoMatching();
      await onWorkspaceDataChanged();
      await fetchAdminData();
      setNotice(`Evaluated ${res.evaluatedCount} synthetic patient-trial pre-screening combinations.`);
    } catch (err: any) {
      setError(err.message || 'Demo matching failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDemo() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteDemoData();
      await onWorkspaceDataChanged();
      await fetchAdminData();
      setNotice('All synthetic demo trials, patients, and demo pre-screening records removed.');
    } catch (err: any) {
      setError(err.message || 'Failed to remove demo data.');
    } finally {
      setBusy(false);
    }
  }

  const filteredLogs = auditLogs.filter((l) => {
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      l.actorName.toLowerCase().includes(q) ||
      l.actionType.toLowerCase().includes(q) ||
      l.summary.toLowerCase().includes(q) ||
      l.entityId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {notice && (
        <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Privacy, Consent & Regulatory Boundary Notice (Module 10) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#0F2942]" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Privacy, Consent & Clinical Safety Governance
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-700 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-semibold text-slate-900">Prototype Compliance Boundary</p>
            <p>
              Clinical Trial Match AI is a research pre-screening and decision-support prototype. It does <strong>not</strong> claim HIPAA, GDPR, or DPDP regulatory certification without an independent institutional compliance assessment and signed BAA/DPA.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="font-semibold text-slate-900">AI Data Safeguards & Consent</p>
            <p>
              Use synthetic or properly de-identified records by default. Patient text is never transmitted to the server-side Gemini model unless explicit authorization is checked on the patient record and AI processing is enabled by policy.
            </p>
          </div>
        </div>
      </div>

      {/* Demo Data Lifecycle & Policy Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Module 11: One-Click Demo Data Control */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-700" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Synthetic Demo Workspace Controls
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Reload the 5 sample clinical trials and 4 synthetic patient profiles (covering Potential Match, Not Met, Missing Documentation, and Conflicting Records), or delete all demo data cleanly.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={handleLoadDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Load Demo Data</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleRunDemoMatching}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <span>Run Demo Matching</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDeleteDemo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Demo Data</span>
            </button>
          </div>
        </div>

        {/* Workspace AI & Review Policy */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Workspace Safeguard Policy {!isAdmin && '(Administrator Read-Only)'}
          </h3>
          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-800">Enable Server-Side Gemini Extraction</span>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={policy.aiProcessingEnabled}
                onChange={(e) => handleTogglePolicy('aiProcessingEnabled', e.target.checked)}
                className="rounded border-slate-300 text-teal-600"
              />
            </label>
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-800">Require Explicit Consent Before AI Calls</span>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={policy.requireConsentBeforeAi}
                onChange={(e) => handleTogglePolicy('requireConsentBeforeAi', e.target.checked)}
                className="rounded border-slate-300 text-teal-600"
              />
            </label>
            <label className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-800">Enforce Human Fact Review Gate Before Matching</span>
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={policy.requireFactReviewBeforeMatch}
                onChange={(e) =>
                  handleTogglePolicy('requireFactReviewBeforeMatch', e.target.checked)
                }
                className="rounded border-slate-300 text-teal-600"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Role-Based Access Table (Administrators Only) */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              User Accounts & Role-Based Access Control ({users.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Email</th>
                  <th className="py-2.5 px-4">Organization</th>
                  <th className="py-2.5 px-4">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{u.fullName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{u.email}</td>
                    <td className="py-2.5 px-4 text-slate-600">{u.organization}</td>
                    <td className="py-2.5 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                        className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                      >
                        <option value="RESEARCH_COORDINATOR">Research Coordinator</option>
                        <option value="CLINICIAN">Clinician</option>
                        <option value="ADMINISTRATOR">Administrator</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Searchable Audit History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Workspace Audit History ({filteredLogs.length})
            </h3>
            <p className="text-xs text-slate-500">
              Immutable trail of logins, trial indexing, AI extractions, fact edits, and reviewer sign-offs.
            </p>
          </div>
          <input
            type="text"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder="Search audit logs..."
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56"
          />
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-500">Loading audit history...</div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Actor & Role</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="font-medium text-slate-900">{log.actorName}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono text-slate-500">{log.actorRole}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[#0F2942] whitespace-nowrap">
                      {log.actionType}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
