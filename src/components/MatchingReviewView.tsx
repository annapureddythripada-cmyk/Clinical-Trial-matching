import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Filter,
  Loader2,
  MessageSquarePlus,
  Play,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadClinicianReportPdf, downloadPatientSummaryPdf } from '../lib/pdfReport';
import type {
  ClinicalTrial,
  CriterionMatchStatus,
  PatientProfile,
  ScreeningMatch,
  UserAccount,
} from '../types/clinical';
import {
  CriterionStatusTag,
  DataOriginTag,
  OverallOutcomeTag,
  ReviewStatusTag,
} from './StatusBadge';

interface MatchingReviewViewProps {
  mode?: 'matching' | 'results';
  currentUser: UserAccount;
  patients: PatientProfile[];
  trials: ClinicalTrial[];
  matches: ScreeningMatch[];
  initialSelectedMatchId?: string | null;
  initialPatientId?: string | null;
  initialTrialId?: string | null;
  onMatchesUpdated: () => Promise<void>;
}

export function MatchingReviewView({
  mode = 'matching',
  currentUser,
  patients,
  trials,
  matches,
  initialSelectedMatchId,
  initialPatientId,
  initialTrialId,
  onMatchesUpdated,
}: MatchingReviewViewProps) {
  const [selectedPatientId, setSelectedPatientId] = useState(
    initialPatientId || patients[0]?.id || '',
  );
  const [selectedTrialId, setSelectedTrialId] = useState(
    initialTrialId || trials[0]?.id || '',
  );
  const [useAiAssistance, setUseAiAssistance] = useState(true);
  const [runningMatch, setRunningMatch] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [pendingGatePrompt, setPendingGatePrompt] = useState<{
    patientId: string;
    trialId: string;
    pendingCount: number;
  } | null>(null);

  // Table Search, Filter & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('ALL');
  const [reviewFilter, setReviewFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'updated' | 'patient' | 'nct'>('updated');

  const [activeMatchId, setActiveMatchId] = useState<string>(
    initialSelectedMatchId || matches[0]?.id || '',
  );

  // Reviewer actions
  const [commentDraft, setCommentDraft] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState<string | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<CriterionMatchStatus>('MET');
  const [overrideNote, setOverrideNote] = useState('');

  // Report Preview Modal
  const [reportModalType, setReportModalType] = useState<'clinician' | 'patient' | null>(null);

  const activeMatch = matches.find((m) => m.id === activeMatchId) || matches[0] || null;
  const activePatient = activeMatch
    ? patients.find((p) => p.id === activeMatch.patientId)
    : undefined;
  const activeTrial = activeMatch
    ? trials.find((t) => t.id === activeMatch.trialId)
    : undefined;

  async function handleRunMatch(acknowledgePendingFacts = false) {
    if (!selectedPatientId || !selectedTrialId) {
      setMatchError('Select both a patient profile and an indexed clinical trial.');
      return;
    }
    setRunningMatch(true);
    setMatchError(null);
    setMatchNotice(null);
    setPendingGatePrompt(null);

    try {
      const res = await api.evaluateMatch({
        patientId: selectedPatientId,
        trialId: selectedTrialId,
        useAiAssistance,
        acknowledgePendingFacts,
      });
      await onMatchesUpdated();
      setActiveMatchId(res.match.id);
      setMatchNotice(
        `Pre-screening completed for ${res.match.patientMrnLabel} × ${res.match.nctId}: ${res.match.overallOutcome.replace(/_/g, ' ')}.`,
      );
    } catch (err: any) {
      if (err.message?.includes('pending human review')) {
        const pt = patients.find((p) => p.id === selectedPatientId);
        const count =
          pt?.extractedFacts.filter((f) => f.reviewStatus === 'PENDING_REVIEW').length || 1;
        setPendingGatePrompt({
          patientId: selectedPatientId,
          trialId: selectedTrialId,
          pendingCount: count,
        });
      } else {
        setMatchError(err.message || 'Failed to evaluate pre-screening match.');
      }
    } finally {
      setRunningMatch(false);
    }
  }

  async function handleAddComment() {
    if (!activeMatch || !commentDraft.trim()) return;
    setSavingReview(true);
    try {
      await api.reviewMatch(activeMatch.id, {
        comment: commentDraft.trim(),
        reviewStatus:
          activeMatch.reviewStatus === 'PENDING_REVIEW'
            ? 'IN_REVIEW'
            : activeMatch.reviewStatus,
      });
      await onMatchesUpdated();
      setCommentDraft('');
    } catch (err: any) {
      setMatchError(err.message || 'Could not save comment.');
    } finally {
      setSavingReview(false);
    }
  }

  async function handleMarkReviewComplete() {
    if (!activeMatch) return;
    setSavingReview(true);
    try {
      await api.reviewMatch(activeMatch.id, {
        reviewStatus: 'REVIEW_COMPLETE',
        comment: `Marked pre-screening review complete by ${currentUser.fullName} (${currentUser.role}).`,
      });
      await onMatchesUpdated();
      setMatchNotice('Pre-screening review marked complete and logged to audit trail.');
    } catch (err: any) {
      setMatchError(err.message || 'Failed to mark review complete.');
    } finally {
      setSavingReview(false);
    }
  }

  async function handleSaveOverride(criterionEvalId: string) {
    if (!activeMatch) return;
    setSavingReview(true);
    try {
      await api.reviewMatch(activeMatch.id, {
        criterionId: criterionEvalId,
        overrideStatus,
        reviewerNote: overrideNote || `Reviewer override by ${currentUser.fullName}`,
        reviewStatus: 'IN_REVIEW',
      });
      await onMatchesUpdated();
      setOverrideTargetId(null);
      setOverrideNote('');
    } catch (err: any) {
      setMatchError(err.message || 'Failed to save criterion override.');
    } finally {
      setSavingReview(false);
    }
  }

  async function handleDownloadPdf(type: 'clinician' | 'patient') {
    if (!activeMatch) return;
    if (type === 'clinician') {
      downloadClinicianReportPdf(activeMatch, activePatient, activeTrial);
      await api.auditReport(activeMatch.id, 'CLINICIAN_COORDINATOR_REPORT', 'PDF').catch(() => {});
    } else {
      downloadPatientSummaryPdf(activeMatch, activeTrial);
      await api.auditReport(activeMatch.id, 'PATIENT_PLAIN_LANGUAGE_SUMMARY', 'PDF').catch(() => {});
    }
  }

  const filteredMatches = matches
    .filter((m) => {
      if (outcomeFilter !== 'ALL' && m.overallOutcome !== outcomeFilter) return false;
      if (reviewFilter !== 'ALL' && m.reviewStatus !== reviewFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          m.patientName.toLowerCase().includes(q) ||
          m.patientMrnLabel.toLowerCase().includes(q) ||
          m.nctId.toLowerCase().includes(q) ||
          m.trialTitle.toLowerCase().includes(q) ||
          m.trialCondition.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'patient') return a.patientName.localeCompare(b.patientName);
      if (sortBy === 'nct') return a.nctId.localeCompare(b.nctId);
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

  return (
    <div className="space-y-5">
      {/* Run New Pre-Screening Evaluation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Run Patient-Trial Pre-Screening Evaluation
            </h2>
            <p className="text-xs text-slate-600">
              Deterministic rules verify age, ECOG, and lab thresholds; missing records remain UNKNOWN and never become NOT MET.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useAiAssistance}
              onChange={(e) => setUseAiAssistance(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
            />
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-teal-700" />
              Use Gemini for qualitative criteria (when authorized)
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Patient Profile
            </label>
            <select
              value={selectedPatientId}
              onChange={(e) => setSelectedPatientId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {patients.length === 0 && <option value="">No patient profiles available</option>}
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.mrnLabel} — {p.displayName} ({p.primaryDiagnosis})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Indexed Clinical Trial
            </label>
            <select
              value={selectedTrialId}
              onChange={(e) => setSelectedTrialId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {trials.length === 0 && <option value="">No indexed trials available</option>}
              {trials.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nctId} — {t.briefTitle || t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex gap-2">
            <button
              type="button"
              disabled={runningMatch || !selectedPatientId || !selectedTrialId}
              onClick={() => handleRunMatch(false)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {runningMatch ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{runningMatch ? 'Evaluating...' : 'Evaluate Match'}</span>
            </button>
            {mode === 'matching' && (
              <button
                type="button"
                disabled={runningMatch}
                onClick={async () => {
                  setRunningMatch(true);
                  setMatchError(null);
                  try {
                    const res = await api.runDemoMatching();
                    await onMatchesUpdated();
                    setMatchNotice(`Ran batch demo matching across ${res.evaluatedCount} patient-trial pairs.`);
                  } catch (err: any) {
                    setMatchError(err.message || 'Demo matching failed.');
                  } finally {
                    setRunningMatch(false);
                  }
                }}
                className="px-3 py-2 text-xs font-semibold rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 cursor-pointer whitespace-nowrap"
              >
                Run Demo Matching
              </button>
            )}
          </div>
        </div>

        {pendingGatePrompt && (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <strong>Human Fact-Review Gate:</strong> This patient has {pendingGatePrompt.pendingCount}{' '}
              extracted clinical fact(s) pending verification. Approve them in Patient Profiles, or proceed using only currently approved facts.
            </div>
            <button
              type="button"
              onClick={() => handleRunMatch(true)}
              className="px-3 py-1.5 rounded bg-amber-800 text-white font-semibold hover:bg-amber-900 cursor-pointer whitespace-nowrap shrink-0"
            >
              Proceed With Approved Facts Only
            </button>
          </div>
        )}

        {matchNotice && (
          <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{matchNotice}</span>
          </div>
        )}
        {matchError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{matchError}</span>
          </div>
        )}
      </div>

      {/* Searchable Matches Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Pre-Screening Results ({filteredMatches.length})
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient, NCT ID, condition..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-56"
            />
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Outcomes</option>
              <option value="POTENTIAL_PRE_SCREENING_MATCH">Potential Match</option>
              <option value="REQUIRES_REVIEW">Requires Review</option>
              <option value="INSUFFICIENT_INFORMATION">Insufficient Info</option>
            </select>
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">All Review States</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="REVIEW_COMPLETE">Review Complete</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="updated">Sort: Most Recent</option>
              <option value="patient">Sort: Patient Name</option>
              <option value="nct">Sort: NCT ID</option>
            </select>
          </div>
        </div>

        {filteredMatches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No pre-screening evaluations match your filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Patient</th>
                  <th className="py-2.5 px-4">Trial / NCT ID</th>
                  <th className="py-2.5 px-4">Location & Recruitment</th>
                  <th className="py-2.5 px-4">Outcome</th>
                  <th className="py-2.5 px-4 text-right">Breakdown</th>
                  <th className="py-2.5 px-4">Review Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredMatches.map((m) => {
                  const isSelected = activeMatch?.id === m.id;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setActiveMatchId(m.id)}
                      className={`transition-colors cursor-pointer ${
                        isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">{m.patientName}</p>
                        <p className="font-mono text-slate-500">{m.patientMrnLabel}</p>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <p className="font-mono font-semibold text-[#0F2942]">{m.nctId}</p>
                        <p className="text-slate-700 truncate">{m.trialTitle}</p>
                        <p className="text-slate-500 truncate">{m.trialCondition}</p>
                      </td>
                      <td className="py-3 px-4">
                        <p className="text-slate-800">{m.trialLocationSummary}</p>
                        <p className="font-mono text-slate-500">{m.recruitmentStatus}</p>
                      </td>
                      <td className="py-3 px-4">
                        <OverallOutcomeTag outcome={m.overallOutcome} />
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-emerald-800">{m.summaryCounts.met}M</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="text-rose-800">{m.summaryCounts.notMet}N</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="text-amber-800">{m.summaryCounts.unknown}U</span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span className="text-orange-800">{m.summaryCounts.conflicting}C</span>
                      </td>
                      <td className="py-3 px-4">
                        <ReviewStatusTag status={m.reviewStatus} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Criterion-by-Criterion Inspection & Reports */}
      {activeMatch && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-200">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <OverallOutcomeTag outcome={activeMatch.overallOutcome} />
                <ReviewStatusTag status={activeMatch.reviewStatus} />
                <DataOriginTag origin={activeMatch.trialDataOrigin} />
                {activeMatch.isDemoGenerated && (
                  <span className="px-2 py-0.5 text-xs font-mono rounded border border-indigo-200 bg-indigo-50 text-indigo-900">
                    SYNTHETIC DEMO OUTPUT
                  </span>
                )}
              </div>
              <h3 className="font-display text-lg font-bold text-slate-900">
                {activeMatch.patientName} ({activeMatch.patientMrnLabel}) × {activeMatch.nctId}
              </h3>
              <p className="text-xs text-slate-600">{activeMatch.trialTitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setReportModalType('clinician')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5 text-[#0F2942]" />
                <span>Clinician Report</span>
              </button>
              <button
                type="button"
                onClick={() => setReportModalType('patient')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 cursor-pointer whitespace-nowrap"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Patient Summary</span>
              </button>
              {activeMatch.reviewStatus !== 'REVIEW_COMPLETE' && (
                <button
                  type="button"
                  disabled={savingReview}
                  onClick={handleMarkReviewComplete}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Mark Review Complete</span>
                </button>
              )}
            </div>
          </div>

          {/* Human Confirmation Notice */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-[#0F2942] shrink-0 mt-0.5" />
            <div>
              <strong className="text-slate-900">Human Confirmation Required:</strong> Pre-screening indicates potential alignment or gaps only. No overall eligibility percentage is calculated. Authorized clinical research staff must verify every criterion and make all final eligibility decisions.
              {activeMatch.reviewedByName && (
                <p className="mt-1 font-mono text-teal-800">
                  Signed off by {activeMatch.reviewedByName} on{' '}
                  {activeMatch.reviewedAt
                    ? new Date(activeMatch.reviewedAt).toLocaleString()
                    : ''}
                </p>
              )}
            </div>
          </div>

          {/* Module 7: Missing Documentation Checklist */}
          {activeMatch.missingDocumentation.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
              <div className="flex items-center gap-2 text-amber-950">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <h4 className="font-display text-sm font-semibold">
                  Missing Documentation Checklist ({activeMatch.missingDocumentation.length})
                </h4>
              </div>
              <p className="text-xs text-amber-900">
                Identified solely from protocol criteria lacking current chart records. This tool does not recommend or order medical tests—the clinical team must decide whether obtaining additional records or testing is appropriate.
              </p>
              <div className="divide-y divide-amber-200/80 bg-white rounded-lg border border-amber-200">
                {activeMatch.missingDocumentation.map((item) => (
                  <div key={item.id} className="p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {item.documentationNeeded}
                      </span>
                      <span className="font-mono text-amber-800">{item.requiredCategory}</span>
                    </div>
                    <p className="text-slate-600">
                      <strong>Required by:</strong> {item.reasonFromCriterion}
                    </p>
                    <p className="text-slate-600">
                      <strong>Record Gap:</strong> {item.currentRecordGap}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Criterion-by-Criterion Breakdown */}
          <div className="space-y-3">
            <h4 className="font-display text-sm font-semibold text-slate-900">
              Criterion-by-Criterion Evidence Matrix ({activeMatch.evaluations.length})
            </h4>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              {activeMatch.evaluations.map((ev) => {
                const effectiveStatus = ev.reviewerOverrideStatus ?? ev.status;
                const isOverriding = overrideTargetId === ev.id;
                return (
                  <div key={ev.id} className="p-4 text-xs space-y-2 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CriterionStatusTag status={effectiveStatus} />
                        <span className="font-mono font-medium text-slate-700">
                          {ev.criterionType} · {ev.category}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{ev.sourceSection}</span>
                        {ev.reviewerOverrideStatus && (
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200 font-medium">
                            Reviewer Overridden (was {ev.status})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-500">
                          {ev.evaluationMethod.replace(/_/g, ' ')} · Conf: {ev.confidence}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOverrideTargetId(isOverriding ? null : ev.id);
                            setOverrideStatus(effectiveStatus);
                            setOverrideNote(ev.reviewerNote || '');
                          }}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                        >
                          {isOverriding ? 'Cancel' : 'Override / Note'}
                        </button>
                      </div>
                    </div>

                    <p className="text-sm font-medium text-slate-900">
                      {ev.originalCriterionText}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div>
                        <p className="font-semibold text-slate-700 mb-0.5">Patient Evidence</p>
                        <p className="text-slate-800">{ev.patientEvidence}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">
                          Source: {ev.evidenceSourceRef}
                        </p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700 mb-0.5">Evaluation Rationale</p>
                        <p className="text-slate-800">{ev.explanation}</p>
                        {ev.uncertaintyNote && (
                          <p className="mt-1 text-amber-800">
                            Uncertainty: {ev.uncertaintyNote}
                          </p>
                        )}
                        {ev.reviewerNote && (
                          <p className="mt-1 text-sky-900 font-medium">
                            Reviewer Note: {ev.reviewerNote}
                          </p>
                        )}
                      </div>
                    </div>

                    {isOverriding && (
                      <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={overrideStatus}
                            onChange={(e) =>
                              setOverrideStatus(e.target.value as CriterionMatchStatus)
                            }
                            className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                          >
                            <option value="MET">MET</option>
                            <option value="NOT_MET">NOT MET</option>
                            <option value="UNKNOWN">UNKNOWN</option>
                            <option value="CONFLICTING">CONFLICTING</option>
                          </select>
                          <input
                            type="text"
                            value={overrideNote}
                            onChange={(e) => setOverrideNote(e.target.value)}
                            placeholder="Clinical justification for override..."
                            className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                          />
                          <button
                            type="button"
                            disabled={savingReview}
                            onClick={() => handleSaveOverride(ev.id)}
                            className="px-3 py-1.5 bg-[#0F2942] text-white rounded font-semibold cursor-pointer"
                          >
                            Save Override
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reviewer Comments & Audit Log */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <h4 className="font-display text-sm font-semibold text-slate-900">
              Reviewer Comments ({activeMatch.reviewerComments.length})
            </h4>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                placeholder="Add clinical review note, source clarification, or follow-up question..."
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              <button
                type="button"
                disabled={savingReview || !commentDraft.trim()}
                onClick={handleAddComment}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Add Comment</span>
              </button>
            </div>

            {activeMatch.reviewerComments.length > 0 && (
              <div className="space-y-2">
                {activeMatch.reviewerComments.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {c.authorName} ({c.authorRole.replace(/_/g, ' ')})
                      </span>
                      <span className="font-mono">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-800">{c.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Module 9: Dual Report Generation Preview Modal */}
      {reportModalType && activeMatch && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setReportModalType('clinician')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    reportModalType === 'clinician'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Clinician / Coordinator Report
                </button>
                <button
                  type="button"
                  onClick={() => setReportModalType('patient')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    reportModalType === 'patient'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Patient Information Summary
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(reportModalType)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReportModalType(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                  aria-label="Close report modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-800 leading-relaxed">
              {reportModalType === 'clinician' ? (
                <>
                  <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950">
                    <strong>Research Decision-Support Notice:</strong> This report summarizes pre-screening evidence alignment for research staff. It does NOT confirm final eligibility, enroll the patient, or recommend treatment.
                  </div>
                  <div>
                    <h4 className="font-display text-base font-bold text-slate-900">
                      Clinician & Coordinator Pre-Screening Report
                    </h4>
                    <p className="text-slate-600 mt-1">
                      Patient: {activeMatch.patientName} ({activeMatch.patientMrnLabel}) · Trial:{' '}
                      {activeMatch.nctId} · Outcome: {activeMatch.overallOutcome.replace(/_/g, ' ')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-semibold text-slate-900">Criterion Findings</h5>
                    {activeMatch.evaluations.map((ev) => (
                      <div key={ev.id} className="p-2.5 rounded border border-slate-200 bg-slate-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{ev.sourceSection}</span>
                          <CriterionStatusTag status={ev.reviewerOverrideStatus ?? ev.status} />
                        </div>
                        <p className="mt-1 text-slate-900">{ev.originalCriterionText}</p>
                        <p className="mt-1 text-slate-600">
                          Evidence: {ev.patientEvidence} ({ev.evidenceSourceRef})
                        </p>
                      </div>
                    ))}
                  </div>

                  {activeMatch.missingDocumentation.length > 0 && (
                    <div>
                      <h5 className="font-semibold text-slate-900 mb-1">
                        Missing Documentation (Clinical Team Determines Appropriateness)
                      </h5>
                      <ul className="list-disc pl-5 space-y-1">
                        {activeMatch.missingDocumentation.map((m) => (
                          <li key={m.id}>
                            {m.documentationNeeded} — {m.currentRecordGap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="p-3.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-950">
                    <strong>Important Patient Notice:</strong> This plain-language summary is prepared to help you discuss a research study with your care team. It is NOT a confirmation that you qualify for the trial, NOT medical advice, and NOT a treatment recommendation.
                  </div>
                  <div>
                    <h4 className="font-display text-base font-bold text-slate-900">
                      Clinical Trial Information Summary
                    </h4>
                    <p className="text-slate-600 mt-1">
                      Study Reference: {activeMatch.nctId} · Status: {activeMatch.recruitmentStatus} · Phase: {activeMatch.trialPhase}
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-900">What This Study Researches</h5>
                    <p className="mt-1 text-slate-700">
                      {activeTrial?.summary || activeMatch.trialTitle}
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-900">Study Location & Team Contact</h5>
                    <p className="mt-1 text-slate-700">
                      {activeTrial?.locations[0]
                        ? `${activeTrial.locations[0].facility} (${activeTrial.locations[0].city}, ${activeTrial.locations[0].country}) — ${activeTrial.locations[0].contactName || 'Research Study Desk'} ${activeTrial.locations[0].contactPhone || ''} ${activeTrial.locations[0].contactEmail || ''}`
                        : activeMatch.trialLocationSummary}
                    </p>
                  </div>
                  <div>
                    <h5 className="font-semibold text-slate-900">
                      Key Eligibility Considerations to Discuss With Your Doctor
                    </h5>
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-700">
                      {activeMatch.evaluations.slice(0, 6).map((ev) => {
                        const eff = ev.reviewerOverrideStatus ?? ev.status;
                        return (
                          <li key={ev.id}>
                            {ev.originalCriterionText} —{' '}
                            <strong>
                              {eff === 'MET'
                                ? 'Appears aligned in initial records'
                                : eff === 'NOT_MET'
                                  ? 'May not align with study rule'
                                  : eff === 'CONFLICTING'
                                    ? 'Needs doctor clarification'
                                    : 'Additional records needed'}
                            </strong>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
