import { Info } from 'lucide-react';
import type { AnalyticsSnapshot } from '../types/clinical';

interface AnalyticsViewProps {
  analytics: AnalyticsSnapshot | null;
}

export function AnalyticsView({ analytics }: AnalyticsViewProps) {
  if (!analytics) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
        Loading workspace analytics...
      </div>
    );
  }

  const { totals, criterionDistribution, reviewCompletion, missingInfoByCategory, searchActivitySeries } =
    analytics;
  const totalCriteria =
    criterionDistribution.MET +
    criterionDistribution.NOT_MET +
    criterionDistribution.UNKNOWN +
    criterionDistribution.CONFLICTING;
  const maxMissing = Math.max(1, ...missingInfoByCategory.map((m) => m.count));
  const maxTrend = Math.max(
    1,
    ...searchActivitySeries.map((d) => Math.max(d.trialSearches, d.preScreenings)),
  );

  return (
    <div className="space-y-6">
      {/* Clear Demo vs Real Analytics Banner */}
      <div className="px-4 py-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <span>
          <strong>
            {analytics.isIllustrativeDemo
              ? 'Illustrative Demo Analytics:'
              : 'Live Workspace Analytics:'}
          </strong>{' '}
          {analytics.isIllustrativeDemo
            ? 'These counts reflect the synthetic demonstration workspace (4 synthetic patients, 5 sample trials) and do not represent real hospital enrollment or clinical outcomes.'
            : 'Counts reflect active non-demo records currently stored in this workspace.'}
        </span>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-600">Patient Profiles Screened</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {totals.patientsInWorkspace}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-600">Clinical Trials Analysed</p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900 tabular-nums">
            {totals.trialsIndexed}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-600">Potential Pre-Screening Matches</p>
          <p className="mt-1 font-display text-2xl font-bold text-teal-700 tabular-nums">
            {totals.potentialMatches}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-600">Records Requiring Review</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber-700 tabular-nums">
            {totals.recordsNeedingReview}
          </p>
        </div>
      </div>

      {/* Criterion Status Breakdown Cards */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Criterion-Level Status Counts
          </h3>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            Total Criteria Evaluated: {totalCriteria}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-xs font-medium text-emerald-900">MET Criteria</p>
            <p className="mt-1 font-mono text-2xl font-bold text-emerald-900 tabular-nums">
              {criterionDistribution.MET}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200">
            <p className="text-xs font-medium text-rose-900">NOT MET Criteria</p>
            <p className="mt-1 font-mono text-2xl font-bold text-rose-900 tabular-nums">
              {criterionDistribution.NOT_MET}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-xs font-medium text-amber-900">UNKNOWN (Missing Info)</p>
            <p className="mt-1 font-mono text-2xl font-bold text-amber-900 tabular-nums">
              {criterionDistribution.UNKNOWN}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-xs font-medium text-orange-900">CONFLICTING Evidence</p>
            <p className="mt-1 font-mono text-2xl font-bold text-orange-900 tabular-nums">
              {criterionDistribution.CONFLICTING}
            </p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Screening Activity Over Time */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Screening & Discovery Activity Over Time
          </h3>
          <svg viewBox="0 0 420 155" className="w-full h-40">
            <line x1="28" y1="125" x2="405" y2="125" stroke="#CBD5E1" strokeWidth="1" />
            {searchActivitySeries.map((pt, i) => {
              const x = 48 + i * 74;
              const hSearch = Math.max(4, (pt.trialSearches / maxTrend) * 95);
              const hScreen = Math.max(4, (pt.preScreenings / maxTrend) * 95);
              return (
                <g key={pt.label}>
                  <rect x={x} y={125 - hSearch} width="18" height={hSearch} rx="3" fill="#0F2942">
                    <title>{`${pt.label}: ${pt.trialSearches} searches`}</title>
                  </rect>
                  <rect x={x + 22} y={125 - hScreen} width="18" height={hScreen} rx="3" fill="#0D9488">
                    <title>{`${pt.label}: ${pt.preScreenings} screenings`}</title>
                  </rect>
                  <text x={x + 20} y="142" textAnchor="middle" fontSize="10" fill="#64748B">
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Missing Information Trends & Review Status */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Missing-Information Trends & Review Completion
          </h3>
          <div className="space-y-2.5 text-xs">
            {missingInfoByCategory.length === 0 ? (
              <p className="text-slate-500">No missing information alerts recorded.</p>
            ) : (
              missingInfoByCategory.map((item) => (
                <div key={item.category} className="flex items-center gap-3">
                  <span className="w-36 font-mono text-slate-700 truncate">{item.category}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500"
                      style={{ width: `${(item.count / maxMissing) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono font-semibold text-slate-900 tabular-nums">
                    {item.count}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 grid grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded bg-slate-50 border border-slate-200">
              <p className="text-slate-600">Pending</p>
              <p className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                {reviewCompletion.PENDING_REVIEW}
              </p>
            </div>
            <div className="p-2.5 rounded bg-sky-50 border border-sky-200">
              <p className="text-sky-900">In Review</p>
              <p className="font-mono text-lg font-bold text-sky-900 tabular-nums">
                {reviewCompletion.IN_REVIEW}
              </p>
            </div>
            <div className="p-2.5 rounded bg-teal-50 border border-teal-200">
              <p className="text-teal-900">Reviewed</p>
              <p className="font-mono text-lg font-bold text-teal-900 tabular-nums">
                {reviewCompletion.REVIEW_COMPLETE}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
