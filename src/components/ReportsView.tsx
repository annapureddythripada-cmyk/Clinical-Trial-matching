import { useState } from 'react';
import { ClipboardList, Download, FileText, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { downloadClinicianReportPdf, downloadPatientSummaryPdf } from '../lib/pdfReport';
import type { ClinicalTrial, PatientProfile, ScreeningMatch } from '../types/clinical';
import { CriterionStatusTag, OverallOutcomeTag } from './StatusBadge';

interface ReportsViewProps {
  matches: ScreeningMatch[];
  patients: PatientProfile[];
  trials: ClinicalTrial[];
}

export function ReportsView({ matches, patients, trials }: ReportsViewProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string>(matches[0]?.id || '');
  const [reportType, setReportType] = useState<'clinician' | 'patient'>('clinician');

  const activeMatch = matches.find((m) => m.id === selectedMatchId) || matches[0] || null;
  const activePatient = activeMatch
    ? patients.find((p) => p.id === activeMatch.patientId)
    : undefined;
  const activeTrial = activeMatch
    ? trials.find((t) => t.id === activeMatch.trialId)
    : undefined;

  async function handleDownload() {
    if (!activeMatch) return;
    if (reportType === 'clinician') {
      downloadClinicianReportPdf(activeMatch, activePatient, activeTrial);
      await api.auditReport(activeMatch.id, 'CLINICIAN_COORDINATOR_REPORT', 'PDF').catch(() => {});
    } else {
      downloadPatientSummaryPdf(activeMatch, activeTrial);
      await api.auditReport(activeMatch.id, 'PATIENT_PLAIN_LANGUAGE_SUMMARY', 'PDF').catch(() => {});
    }
  }

  async function handlePrint() {
    if (!activeMatch) return;
    await api
      .auditReport(
        activeMatch.id,
        reportType === 'clinician' ? 'CLINICIAN_COORDINATOR_REPORT' : 'PATIENT_PLAIN_LANGUAGE_SUMMARY',
        'PRINT',
      )
      .catch(() => {});
    window.print();
  }

  if (!activeMatch) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
        No pre-screening evaluations available yet. Run a patient-trial evaluation first to generate reports.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Pre-Screening Record
            </label>
            <select
              value={activeMatch.id}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.patientMrnLabel} ({m.patientName}) × {m.nctId} — {m.overallOutcome.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Report Format</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setReportType('clinician')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                  reportType === 'clinician'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Clinician / Coordinator</span>
              </button>
              <button
                type="button"
                onClick={() => setReportType('patient')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${
                  reportType === 'patient'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Patient-Friendly</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>

      {/* Report Document Sheet */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6 max-w-4xl">
        {reportType === 'clinician' ? (
          <>
            <div className="pb-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  CLINICAL TRIAL MATCH AI · CLINICIAN & RESEARCH COORDINATOR REPORT
                </p>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                  Pre-Screening Evaluation: {activeMatch.patientMrnLabel} × {activeMatch.nctId}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Generated {new Date().toLocaleDateString()} · Review Status:{' '}
                  {activeMatch.reviewStatus.replace(/_/g, ' ')}
                </p>
              </div>
              <OverallOutcomeTag outcome={activeMatch.overallOutcome} />
            </div>

            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
              <strong>Preliminary Screening Disclaimer:</strong> This report supports clinical research pre-screening only. It does NOT establish final trial eligibility, diagnose conditions, recommend treatments, or enrol patients. Authorized clinical staff must verify all evidence independently.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-900">Patient Reference Summary</p>
                <p>ID: <span className="font-mono">{activeMatch.patientMrnLabel}</span></p>
                <p>Label: {activeMatch.patientName}</p>
                {activePatient && (
                  <>
                    <p>Age / Sex: {activePatient.age ?? 'Unknown'} / {activePatient.sex}</p>
                    <p>Diagnosis: {activePatient.primaryDiagnosis} ({activePatient.diseaseStage})</p>
                  </>
                )}
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-semibold text-slate-900">Protocol Summary</p>
                <p>NCT ID: <span className="font-mono">{activeMatch.nctId}</span></p>
                <p>Title: {activeTrial?.title || activeMatch.trialTitle}</p>
                <p>Phase / Status: {activeMatch.trialPhase} · {activeMatch.recruitmentStatus}</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Criterion-by-Criterion Findings ({activeMatch.evaluations.length})
              </h3>
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {activeMatch.evaluations.map((ev) => (
                  <div key={ev.id} className="p-3.5 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-700">
                        {ev.criterionType} · {ev.sourceSection}
                      </span>
                      <CriterionStatusTag status={ev.reviewerOverrideStatus ?? ev.status} />
                    </div>
                    <p className="font-medium text-slate-900">{ev.originalCriterionText}</p>
                    <p className="text-slate-700">
                      <strong>Supporting Evidence:</strong> {ev.patientEvidence} ({ev.evidenceSourceRef})
                    </p>
                    <p className="text-slate-600">{ev.explanation}</p>
                  </div>
                ))}
              </div>
            </div>

            {activeMatch.missingDocumentation.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Missing Documentation Identified
                </h3>
                <ul className="list-disc pl-5 text-xs text-slate-700 space-y-1">
                  {activeMatch.missingDocumentation.map((m) => (
                    <li key={m.id}>
                      <strong>{m.documentationNeeded}:</strong> {m.currentRecordGap} (Required by {m.reasonFromCriterion})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {activeMatch.reviewerComments.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Reviewer Comments
                </h3>
                {activeMatch.reviewerComments.map((c) => (
                  <div key={c.id} className="p-3 rounded bg-slate-50 border border-slate-200 text-xs">
                    <p className="font-semibold text-slate-900">
                      {c.authorName} · {new Date(c.createdAt).toLocaleString()}
                    </p>
                    <p className="text-slate-700 mt-1">{c.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="pb-4 border-b border-slate-200">
              <p className="text-xs font-mono text-teal-800">
                PATIENT-FRIENDLY CLINICAL TRIAL INFORMATION SUMMARY
              </p>
              <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
                Study Overview for Discussion With Your Doctor
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Prepared for {activeMatch.patientName} · Study Reference {activeMatch.nctId} ·{' '}
                {new Date().toLocaleDateString()}
              </p>
            </div>

            <div className="p-4 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-950 leading-relaxed">
              <strong>Important Notice:</strong> This summary is for discussion with a qualified healthcare professional only. It is <strong>not</strong> a confirmation that you qualify for this study, <strong>not</strong> medical advice, and <strong>not</strong> a treatment recommendation.
            </div>

            <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                What This Clinical Trial Is About
              </h3>
              <p className="font-medium text-slate-900">{activeTrial?.title || activeMatch.trialTitle}</p>
              <p>{activeTrial?.summary || 'Detailed study protocol available on ClinicalTrials.gov.'}</p>
              <p>
                <strong>Status:</strong> {activeMatch.recruitmentStatus} · <strong>Phase:</strong>{' '}
                {activeMatch.trialPhase} · <strong>Primary Location:</strong>{' '}
                {activeMatch.trialLocationSummary}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Why This Study May Be Worth Discussing & What Needs Checking
              </h3>
              <ul className="space-y-2">
                {activeMatch.evaluations.map((ev) => {
                  const eff = ev.reviewerOverrideStatus ?? ev.status;
                  return (
                    <li key={ev.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="font-medium text-slate-900">{ev.originalCriterionText}</p>
                      <p className="mt-1 text-slate-600">
                        {eff === 'MET'
                          ? 'Information currently on file appears to align with this point.'
                          : eff === 'NOT_MET'
                            ? 'Information on file suggests this requirement may not be met — confirm with your doctor.'
                            : eff === 'CONFLICTING'
                              ? 'Your medical records show different details here; your care team can clarify.'
                              : 'More information is needed from your medical records to review this point.'}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <p className="font-semibold text-slate-900 mb-1">Next Step: Speak With Your Care Team</p>
              <p>
                Bring this summary to your oncologist or research coordinator to review your full medical history and contact the study team
                {activeTrial?.locations[0]?.contactPhone
                  ? ` (${activeTrial.locations[0].contactName || 'Research Office'}: ${activeTrial.locations[0].contactPhone})`
                  : '.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
