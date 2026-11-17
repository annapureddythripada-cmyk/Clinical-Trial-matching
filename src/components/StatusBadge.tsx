import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  XCircle,
  Clock,
  FileCheck2,
  Database,
} from 'lucide-react';
import type {
  CriterionMatchStatus,
  MatchReviewStatus,
  OverallMatchOutcome,
  TemporalStatus,
  TrialDataOrigin,
} from '../types/clinical';

export function CriterionStatusTag({ status }: { status: CriterionMatchStatus }) {
  const styles: Record<CriterionMatchStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    MET: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      label: 'MET',
      Icon: CheckCircle2,
    },
    NOT_MET: {
      cls: 'bg-rose-50 text-rose-800 border-rose-200',
      label: 'NOT MET',
      Icon: XCircle,
    },
    UNKNOWN: {
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
      label: 'UNKNOWN',
      Icon: HelpCircle,
    },
    CONFLICTING: {
      cls: 'bg-orange-50 text-orange-900 border-orange-300',
      label: 'CONFLICTING',
      Icon: AlertTriangle,
    },
  };
  const { cls, label, Icon } = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded border whitespace-nowrap shrink-0 font-mono tabular-nums ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function OverallOutcomeTag({ outcome }: { outcome: OverallMatchOutcome }) {
  const map: Record<OverallMatchOutcome, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
    POTENTIAL_PRE_SCREENING_MATCH: {
      cls: 'bg-teal-50 text-teal-900 border-teal-300',
      label: 'POTENTIAL PRE-SCREENING MATCH',
      Icon: CheckCircle2,
    },
    REQUIRES_REVIEW: {
      cls: 'bg-rose-50 text-rose-900 border-rose-200',
      label: 'REQUIRES FURTHER REVIEW',
      Icon: ShieldAlert,
    },
    INSUFFICIENT_INFORMATION: {
      cls: 'bg-amber-50 text-amber-900 border-amber-200',
      label: 'INSUFFICIENT INFORMATION',
      Icon: HelpCircle,
    },
  };
  const { cls, label, Icon } = map[outcome];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded border whitespace-nowrap shrink-0 ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function ReviewStatusTag({ status }: { status: MatchReviewStatus }) {
  const map: Record<MatchReviewStatus, { cls: string; label: string; Icon: typeof Clock }> = {
    PENDING_REVIEW: {
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
      label: 'Pending Review',
      Icon: Clock,
    },
    IN_REVIEW: {
      cls: 'bg-sky-50 text-sky-800 border-sky-200',
      label: 'In Review',
      Icon: Clock,
    },
    REVIEW_COMPLETE: {
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      label: 'Review Complete',
      Icon: FileCheck2,
    },
  };
  const { cls, label, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${cls}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function TemporalStatusTag({ status }: { status: TemporalStatus }) {
  const map: Record<TemporalStatus, { cls: string; label: string }> = {
    CURRENT: { cls: 'bg-sky-50 text-sky-900 border-sky-200', label: 'Current' },
    HISTORICAL: { cls: 'bg-slate-100 text-slate-700 border-slate-300', label: 'Historical' },
    NEGATED: { cls: 'bg-teal-50 text-teal-900 border-teal-200', label: 'Negated / Absent' },
    UNCERTAIN: { cls: 'bg-amber-50 text-amber-900 border-amber-200', label: 'Uncertain' },
  };
  const { cls, label } = map[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

export function DataOriginTag({ origin }: { origin: TrialDataOrigin }) {
  const map: Record<TrialDataOrigin, { cls: string; label: string }> = {
    PUBLIC_REGISTRY: {
      cls: 'bg-slate-100 text-slate-800 border-slate-300',
      label: 'ClinicalTrials.gov Public Registry',
    },
    SITE_VERIFIED: {
      cls: 'bg-teal-50 text-teal-900 border-teal-300',
      label: 'Site Verified Protocol',
    },
    DEMO_SYNTHETIC: {
      cls: 'bg-indigo-50 text-indigo-900 border-indigo-200',
      label: 'Synthetic Demo Record',
    },
  };
  const { cls, label } = map[origin];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${cls}`}>
      <Database className="w-3 h-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
