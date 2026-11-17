import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  FileSearch,
  FlaskConical,
  Info,
  Users,
} from 'lucide-react';
import type { AnalyticsSnapshot, ScreeningMatch } from '../types/clinical';
import { OverallOutcomeTag, ReviewStatusTag } from './StatusBadge';

export type NavSection =
  | 'dashboard'
  | 'trials'
  | 'patients'
  | 'matching'
  | 'results'
  | 'reports'
  | 'analytics'
  | 'settings';

interface DashboardViewProps {
  analytics: AnalyticsSnapshot | null;
  matches: ScreeningMatch[];
  loading: boolean;
  onNavigate: (section: NavSection) => void;
  onSelectMatch: (matchId: string) => void;
}

export function DashboardView({
  analytics,
  matches,
  loading,
  onNavigate,
  onSelectMatch,
}: DashboardViewProps) {
  if (loading || !analytics) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  const { totals, criterionDistribution, reviewCompletion, missingInfoByCategory, searchActivitySeries } =
    analytics;

  const totalCriteriaEvaluated =
    criterionDistribution.MET +
    criterionDistribution.NOT_MET +
    criterionDistribution.UNKNOWN +
    criterionDistribution.CONFLICTING;

  const maxActivity = Math.max(
    1,
    ...searchActivitySeries.map((d) => Math.max(d.trialSearches, d.preScreenings)),
  );
  const maxMissing = Math.max(1, ...missingInfoByCategory.map((c) => c.count));

  const kpis = [
    {
      label: 'Trials Indexed',
      value: totals.trialsIndexed,
      sub: 'Registry + Demo protocols',
      onClick: () => onNavigate('trials'),
    },
    {
      label: 'Patient Profiles',
      value: totals.patientsInWorkspace,
      sub: analytics.isIllustrativeDemo ? 'Includes synthetic demo' : 'Active workspace',
      onClick: () => onNavigate('patients'),
    },
    {
      label: 'Potential Matches',
      value: totals.potentialMatches,
      sub: 'Requires human sign-off',
      accent: 'text-teal-700',
      onClick: () => onNavigate('results'),
    },
    {
      label: 'Needing Review',
      value: totals.recordsNeedingReview,
      sub: 'Pending / In-Review queue',
      accent: 'text-amber-700',
      onClick: () => onNavigate('results'),
    },
    {
      label: 'Missing-Info Alerts',
      value: totals.missingInfoAlerts,
      sub: 'Criteria documentation gaps',
      accent: 'text-rose-700',
      onClick: () => onNavigate('results'),
    },
  ];

  const criterionBars = [
    { key: 'MET', label: 'Met', count: criterionDistribution.MET, color: 'bg-emerald-600' },
    { key: 'NOT_MET', label: 'Not Met', count: criterionDistribution.NOT_MET, color: 'bg-rose-600' },
    { key: 'UNKNOWN', label: 'Unknown / Gap', count: criterionDistribution.UNKNOWN, color: 'bg-amber-500' },
    {
      key: 'CONFLICTING',
      label: 'Conflicting',
      count: criterionDistribution.CONFLICTING,
      color: 'bg-orange-600',
    },
  ];

  const reviewBars = [
    { label: 'Pending Review', count: reviewCompletion.PENDING_REVIEW, color: 'bg-slate-500' },
    { label: 'In Review', count: reviewCompletion.IN_REVIEW, color: 'bg-sky-600' },
    { label: 'Review Complete', count: reviewCompletion.REVIEW_COMPLETE, color: 'bg-teal-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Illustrative Demo Banner */}
      {analytics.isIllustrativeDemo && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950">
          <div className="flex items-start sm:items-center gap-2.5">
            <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              <strong className="font-semibold">Illustrative Demo Workspace Active:</strong> Metrics, synthetic patient records, and pre-screening counts shown below are for workflow demonstration only—not actual clinical performance data.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="text-xs font-semibold text-sky-800 hover:text-sky-950 underline whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
          >
            Manage Demo Data
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className="text-left bg-white border border-slate-200 hover:border-teal-300 rounded-xl p-4 transition-colors cursor-pointer"
          >
            <p className="text-xs font-medium text-slate-600">{kpi.label}</p>
            <p
              className={`mt-1.5 font-display text-2xl font-bold tabular-nums ${
                kpi.accent || 'text-slate-900'
              }`}
            >
              {kpi.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{kpi.sub}</p>
          </button>
        ))}
      </div>

      {/* Quick Clinical Workflow Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pre-Screening Research Workflow
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Search ClinicalTrials.gov protocols, review AI-extracted patient facts, and verify criterion-level evidence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('trials')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <FlaskConical className="w-3.5 h-3.5 text-teal-700" />
              <span>Discover Trials</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('patients')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5 text-teal-700" />
              <span>Patient Profiles</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('matching')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] text-white hover:bg-[#163A5C] cursor-pointer whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Run & Review Matches</span>
            </button>
          </div>
        </div>
      </div>

      {/* Module 12: Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Criterion Status Distribution & Review Completion */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Criterion Evaluation Distribution
              </h3>
              <p className="text-xs text-slate-500">
                Across {totalCriteriaEvaluated} evaluated criteria ({analytics.isIllustrativeDemo ? 'Illustrative Demo' : 'Live Workspace'})
              </p>
            </div>
            <span className="font-mono text-xs text-slate-600 tabular-nums">
              n = {totalCriteriaEvaluated}
            </span>
          </div>

          {/* Stacked Bar */}
          <div className="h-3.5 w-full bg-slate-100 rounded-md overflow-hidden flex">
            {totalCriteriaEvaluated > 0 &&
              criterionBars.map((b) => {
                const pct = (b.count / totalCriteriaEvaluated) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={b.key}
                    style={{ width: `${pct}%` }}
                    className={`${b.color} transition-all`}
                    title={`${b.label}: ${b.count}`}
                  />
                );
              })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {criterionBars.map((b) => (
              <div key={b.key} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className={`w-2.5 h-2.5 rounded-sm ${b.color}`} />
                  <span>{b.label}</span>
                </div>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {b.count}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700 mb-2.5">
              Pre-Screening Review Workflow Counts
            </h4>
            <div className="space-y-2">
              {reviewBars.map((rb) => {
                const pct = totals.totalMatchesRun > 0 ? Math.round((rb.count / totals.totalMatchesRun) * 100) : 0;
                return (
                  <div key={rb.label} className="flex items-center gap-3 text-xs">
                    <span className="w-28 text-slate-600 shrink-0">{rb.label}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${rb.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-14 text-right font-mono text-slate-800 tabular-nums">
                      {rb.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chart 2: Discovery Activity & Missing-Information Trends */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Trial Discovery & Screening Activity
              </h3>
              <p className="text-xs text-slate-500">
                Recent searches vs. pre-screening evaluations ({analytics.isIllustrativeDemo ? 'Illustrative' : 'Actual'})
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#0F2942]" />
                Searches
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-teal-600" />
                Screenings
              </span>
            </div>
          </div>

          {/* Crisp SVG Grouped Bar Chart */}
          <div className="w-full overflow-x-auto">
            <svg viewBox="0 0 420 140" className="w-full h-36" role="img" aria-label="Trial search and pre-screening activity chart">
              <line x1="28" y1="112" x2="408" y2="112" stroke="#CBD5E1" strokeWidth="1" />
              <line x1="28" y1="62" x2="408" y2="62" stroke="#E2E8F0" strokeDasharray="3 3" strokeWidth="1" />
              <line x1="28" y1="16" x2="408" y2="16" stroke="#E2E8F0" strokeDasharray="3 3" strokeWidth="1" />

              {searchActivitySeries.map((pt, i) => {
                const groupX = 48 + i * 74;
                const h1 = Math.max(4, (pt.trialSearches / maxActivity) * 90);
                const h2 = Math.max(4, (pt.preScreenings / maxActivity) * 90);
                return (
                  <g key={pt.label}>
                    <rect
                      x={groupX}
                      y={112 - h1}
                      width="18"
                      height={h1}
                      rx="3"
                      fill="#0F2942"
                    >
                      <title>{`${pt.label}: ${pt.trialSearches} trial searches`}</title>
                    </rect>
                    <rect
                      x={groupX + 22}
                      y={112 - h2}
                      width="18"
                      height={h2}
                      rx="3"
                      fill="#0D9488"
                    >
                      <title>{`${pt.label}: ${pt.preScreenings} pre-screenings`}</title>
                    </rect>
                    <text
                      x={groupX + 20}
                      y="129"
                      textAnchor="middle"
                      fontSize="10"
                      fill="#64748B"
                    >
                      {pt.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700 mb-2.5">
              Missing Documentation Trends by Category
            </h4>
            {missingInfoByCategory.length === 0 ? (
              <p className="text-xs text-slate-500">No missing documentation gaps currently flagged.</p>
            ) : (
              <div className="space-y-2">
                {missingInfoByCategory.map((item) => (
                  <div key={item.category} className="flex items-center gap-3 text-xs">
                    <span className="w-36 text-slate-700 truncate font-mono">{item.category}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${(item.count / maxMissing) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-slate-800 tabular-nums">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Pre-Screening Queue Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Recent Pre-Screening Evaluations & Alerts
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any evaluation to inspect criterion evidence, missing records, and reviewer notes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('matching')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer whitespace-nowrap"
          >
            <span>View All Results</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {matches.length === 0 ? (
          <div className="p-8 text-center">
            <FileSearch className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-800">No pre-screening matches yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Run a patient-trial pre-screen or load demo data to inspect sample outcomes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Patient</th>
                  <th className="py-2.5 px-4">Trial & NCT ID</th>
                  <th className="py-2.5 px-4">Pre-Screening Outcome</th>
                  <th className="py-2.5 px-4 text-right">Criteria Summary</th>
                  <th className="py-2.5 px-4">Review Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {matches.slice(0, 6).map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => onSelectMatch(m.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{m.patientName}</p>
                      <p className="font-mono text-slate-500">{m.patientMrnLabel}</p>
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <p className="font-mono font-medium text-slate-900">{m.nctId}</p>
                      <p className="text-slate-600 truncate">{m.trialTitle}</p>
                    </td>
                    <td className="py-3 px-4">
                      <OverallOutcomeTag outcome={m.overallOutcome} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      <span>{m.summaryCounts.met} Met</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>{m.summaryCounts.notMet} Not Met</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>{m.summaryCounts.unknown} Unk</span>
                      {m.summaryCounts.conflicting > 0 && (
                        <>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="text-orange-700 font-semibold inline-flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" />
                            {m.summaryCounts.conflicting} Conflict
                          </span>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <ReviewStatusTag status={m.reviewStatus} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMatch(m.id);
                        }}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer whitespace-nowrap"
                      >
                        Inspect
                      </button>
                    </td>
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
