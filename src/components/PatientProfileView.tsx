import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Edit3,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ExtractedClinicalFact, LabResult, PatientProfile, TemporalStatus } from '../types/clinical';
import { TemporalStatusTag } from './StatusBadge';

interface PatientProfileViewProps {
  patients: PatientProfile[];
  onPatientsUpdated: () => Promise<void>;
  onNavigateToMatching: (patientId: string) => void;
}

const EMPTY_PATIENT_DRAFT = (): Partial<PatientProfile> => ({
  mrnLabel: `SYNTH-PT-${String(Math.floor(100 + Math.random() * 900))}`,
  displayName: '',
  isSynthetic: true,
  age: null,
  dateOfBirth: '',
  sex: 'FEMALE',
  primaryDiagnosis: '',
  diseaseStage: '',
  ecogStatus: 1,
  medicalHistory: [],
  medications: [],
  allergies: [],
  previousTreatments: [],
  pathologyInfo: '',
  labResults: [],
  clinicalNotes: '',
  missingOrUncertainFields: [],
  aiProcessingAuthorized: false,
});

export function PatientProfileView({
  patients,
  onPatientsUpdated,
  onNavigateToMatching,
}: PatientProfileViewProps) {
  const [selectedId, setSelectedId] = useState<string>(patients[0]?.id || 'new');
  const [creatingNew, setCreatingNew] = useState(false);

  const activePatient = creatingNew
    ? null
    : patients.find((p) => p.id === selectedId) || patients[0] || null;

  const [formState, setFormState] = useState<Partial<PatientProfile>>(
    activePatient ? structuredClone(activePatient) : EMPTY_PATIENT_DRAFT(),
  );

  // Raw comma/newline inputs for list fields
  const [historyText, setHistoryText] = useState(
    (activePatient?.medicalHistory || []).join(', '),
  );
  const [medsText, setMedsText] = useState((activePatient?.medications || []).join(', '));
  const [allergiesText, setAllergiesText] = useState((activePatient?.allergies || []).join(', '));
  const [treatmentsText, setTreatmentsText] = useState(
    (activePatient?.previousTreatments || []).join(', '),
  );

  const [uploadedPdfBase64, setUploadedPdfBase64] = useState<string | null>(null);
  const [uploadedDocName, setUploadedDocName] = useState<string | null>(
    activePatient?.uploadedDocumentName || null,
  );

  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add Lab state
  const [newLabKey, setNewLabKey] = useState('anc');
  const [newLabVal, setNewLabVal] = useState('');
  const [newLabDate, setNewLabDate] = useState('2026-11-15');

  // Fact editing state
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [factEditValue, setFactEditValue] = useState('');
  const [factEditTemporal, setFactEditTemporal] = useState<TemporalStatus>('CURRENT');
  const [patientSearch, setPatientSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function selectPatient(patient: PatientProfile) {
    setCreatingNew(false);
    setSelectedId(patient.id);
    setFormState(structuredClone(patient));
    setHistoryText(patient.medicalHistory.join(', '));
    setMedsText(patient.medications.join(', '));
    setAllergiesText(patient.allergies.join(', '));
    setTreatmentsText(patient.previousTreatments.join(', '));
    setUploadedDocName(patient.uploadedDocumentName || null);
    setUploadedPdfBase64(null);
    setMessage(null);
    setError(null);
  }

  function startNewPatient() {
    setCreatingNew(true);
    setSelectedId('new');
    const draft = EMPTY_PATIENT_DRAFT();
    setFormState(draft);
    setHistoryText('');
    setMedsText('');
    setAllergiesText('');
    setTreatmentsText('');
    setUploadedDocName(null);
    setUploadedPdfBase64(null);
    setMessage(null);
    setError(null);
  }

  function handleLoadSampleNote() {
    setFormState((prev) => ({
      ...prev,
      displayName: prev.displayName || 'Jordan Mercer (Synthetic Sample)',
      age: prev.age ?? 61,
      sex: prev.sex || 'FEMALE',
      primaryDiagnosis: prev.primaryDiagnosis || 'Non-Small Cell Lung Cancer (Adenocarcinoma)',
      diseaseStage: prev.diseaseStage || 'Stage IV',
      ecogStatus: prev.ecogStatus ?? 1,
      pathologyInfo:
        prev.pathologyInfo ||
        'TTF-1+ lung adenocarcinoma. NGS shows EGFR Exon 19 deletion. PD-L1 TPS 20%.',
      clinicalNotes:
        'SYNTHETIC SAMPLE NOTE: 61-year-old female with Stage IV NSCLC (EGFR Exon 19 deletion). ECOG performance status 1. Brain MRI (2026-11-02) shows no CNS or brain metastases. No prior EGFR TKI therapy administered. Recent CBC (2026-11-10): ANC 2,300 /µL, Platelets 180,000 /µL, Hemoglobin 11.8 g/dL. eGFR 74 mL/min.',
    }));
    setUploadedDocName('Synthetic_Sample_Consult_Note.txt');
    setMessage('Loaded synthetic clinical note template. Save profile before running Gemini extraction.');
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setMessage(null);

    if (file.size > 8 * 1024 * 1024) {
      setError('Uploaded file exceeds 8 MB limit.');
      return;
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isTxt = file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt');

    if (!isPdf && !isTxt) {
      setError('Please upload a .TXT or .PDF sample clinical record.');
      return;
    }

    setUploadedDocName(file.name);
    if (isTxt) {
      const text = await file.text();
      setUploadedPdfBase64(null);
      setFormState((prev) => ({
        ...prev,
        clinicalNotes: prev.clinicalNotes ? `${prev.clinicalNotes}\n\n${text}` : text,
        uploadedDocumentName: file.name,
      }));
      setMessage(`Loaded text from ${file.name} into Clinical Notes.`);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        setUploadedPdfBase64(base64);
        setFormState((prev) => ({ ...prev, uploadedDocumentName: file.name }));
        setMessage(`Attached PDF "${file.name}" for Gemini clinical extraction.`);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleAddLab() {
    const num = Number(newLabVal);
    if (!newLabVal.trim() || Number.isNaN(num)) {
      setError('Enter a valid numeric laboratory value.');
      return;
    }
    const metaMap: Record<string, { name: string; unit: string }> = {
      anc: { name: 'Absolute Neutrophil Count (ANC)', unit: '/µL' },
      platelets: { name: 'Platelet Count', unit: '/µL' },
      hemoglobin: { name: 'Hemoglobin', unit: 'g/dL' },
      egfr: { name: 'Estimated GFR (eGFR)', unit: 'mL/min' },
      ast: { name: 'AST', unit: 'U/L' },
      alt: { name: 'ALT', unit: 'U/L' },
      bilirubin: { name: 'Total Bilirubin', unit: 'mg/dL' },
      lvef: { name: 'LVEF (Echocardiogram)', unit: '%' },
      pdl1_cps: { name: 'PD-L1 CPS Score', unit: 'CPS' },
    };
    const meta = metaMap[newLabKey] || { name: newLabKey.toUpperCase(), unit: '' };
    const lab: LabResult = {
      id: `lab-${Date.now()}`,
      name: meta.name,
      parameterKey: newLabKey,
      value: num,
      unit: meta.unit,
      testDate: newLabDate || '2026-11-15',
      sourceLocation: `Manual Lab Entry (${newLabDate})`,
    };
    setFormState((prev) => ({
      ...prev,
      labResults: [...(prev.labResults || []), lab],
    }));
    setNewLabVal('');
    setError(null);
  }

  function handleRemoveLab(labId: string) {
    setFormState((prev) => ({
      ...prev,
      labResults: (prev.labResults || []).filter((l) => l.id !== labId),
    }));
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!formState.displayName?.trim() || !formState.primaryDiagnosis?.trim()) {
      setError('Display Name / Label and Primary Diagnosis are required.');
      return;
    }
    setSaving(true);
    try {
      const splitList = (s: string) =>
        s
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

      const res = await api.savePatient({
        ...formState,
        id: creatingNew ? undefined : activePatient?.id,
        medicalHistory: splitList(historyText),
        medications: splitList(medsText),
        allergies: splitList(allergiesText),
        previousTreatments: splitList(treatmentsText),
        uploadedDocumentName: uploadedDocName,
      });
      await onPatientsUpdated();
      setCreatingNew(false);
      setSelectedId(res.patient.id);
      setFormState(structuredClone(res.patient));
      setMessage('Patient profile saved to workspace.');
    } catch (err: any) {
      setError(err.message || 'Failed to save patient profile.');
    } finally {
      setSaving(false);
    }
  }

  async function handleExtractFacts() {
    if (!activePatient || creatingNew) {
      setError('Save the patient profile first before running AI clinical extraction.');
      return;
    }
    if (!formState.aiProcessingAuthorized) {
      setError(
        'Check the AI Processing Authorization consent box before sending clinical text or PDFs to Gemini.',
      );
      return;
    }
    setExtracting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.extractPatientFacts(activePatient.id, {
        clinicalText: formState.clinicalNotes || '',
        pdfBase64: uploadedPdfBase64 || undefined,
        documentName: uploadedDocName || 'Clinical Notes',
        aiProcessingAuthorized: true,
      });
      await onPatientsUpdated();
      setFormState(structuredClone(res.patient));
      setMessage(
        `Gemini extracted ${res.extractedCount} clinical fact(s). Review and approve facts below before matching.`,
      );
    } catch (err: any) {
      setError(err.message || 'Gemini clinical extraction failed.');
    } finally {
      setExtracting(false);
    }
  }

  async function handleReviewFact(
    fact: ExtractedClinicalFact,
    reviewStatus: 'APPROVED' | 'EDITED' | 'REJECTED',
  ) {
    if (!activePatient) return;
    setError(null);
    try {
      const payload =
        reviewStatus === 'EDITED'
          ? {
              reviewStatus,
              value: factEditValue,
              temporalStatus: factEditTemporal,
            }
          : { reviewStatus };
      const res = await api.reviewPatientFact(activePatient.id, fact.id, payload);
      await onPatientsUpdated();
      setFormState(structuredClone(res.patient));
      setEditingFactId(null);
    } catch (err: any) {
      setError(err.message || 'Could not update fact review status.');
    }
  }

  async function handleDeletePatient(patientId: string) {
    setError(null);
    try {
      await api.deletePatient(patientId);
      await onPatientsUpdated();
      startNewPatient();
      setMessage('Deleted patient profile.');
    } catch (err: any) {
      setError(err.message || 'Failed to delete patient.');
    }
  }

  const currentFacts = activePatient?.extractedFacts || [];
  const pendingCount = currentFacts.filter((f) => f.reviewStatus === 'PENDING_REVIEW').length;

  return (
    <div className="space-y-5">
      {/* Synthetic Safety Banner */}
      <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span>
          <strong className="font-semibold">Synthetic & De-Identified Data Policy:</strong> Demo workspace profiles are 100% synthetic. Never enter real patient identifiers (real names, SSNs, or MRNs) in demonstration mode.
        </span>
        <button
          type="button"
          onClick={startNewPatient}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F2942] text-white font-semibold hover:bg-[#163A5C] cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Synthetic Profile</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Patient Selector */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 space-y-2">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Patient Profiles ({patients.length})
            </h2>
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search by ID, name, or diagnosis..."
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {patients.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No patient profiles in workspace. Create a synthetic profile or load demo data.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[760px] overflow-y-auto">
              {patients
                .filter((pt) => {
                  if (!patientSearch.trim()) return true;
                  const q = patientSearch.toLowerCase();
                  return (
                    pt.displayName.toLowerCase().includes(q) ||
                    pt.mrnLabel.toLowerCase().includes(q) ||
                    pt.primaryDiagnosis.toLowerCase().includes(q)
                  );
                })
                .map((pt) => {
                  const isActive = !creatingNew && activePatient?.id === pt.id;
                  const ptPending = pt.extractedFacts.filter(
                    (f) => f.reviewStatus === 'PENDING_REVIEW',
                  ).length;
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => {
                        selectPatient(pt);
                        setConfirmDeleteId(null);
                      }}
                      className={`w-full text-left p-4 transition-colors cursor-pointer ${
                        isActive ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#0F2942]">{pt.mrnLabel}</span>
                        <span className="text-slate-500 font-mono">
                          {pt.age ?? '?'}y · {pt.sex}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{pt.displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-600 truncate">{pt.primaryDiagnosis}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{pt.labResults.length} labs</span>
                        <span>·</span>
                        <span>{pt.extractedFacts.length} facts</span>
                        {ptPending > 0 && (
                          <>
                            <span>·</span>
                            <span className="text-amber-700 font-semibold">{ptPending} pending review</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Right Patient Editor + AI Fact Extraction Gate */}
        <div className="lg:col-span-8 space-y-5">
          {message && (
            <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Structured Patient Form */}
          <form onSubmit={handleSaveProfile} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {creatingNew ? 'Create Synthetic Patient Profile' : formState.displayName || 'Patient Record'}
                </h3>
                <p className="text-xs text-slate-500">
                  Structured fields + clinical text preserved with source provenance.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSampleNote}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Load Sample Note
                </button>
                {!creatingNew && activePatient && (
                  <button
                    type="button"
                    onClick={() => onNavigateToMatching(activePatient.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-800 text-white cursor-pointer whitespace-nowrap"
                  >
                    Match to Trials
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Synthetic Label / Name *
                </label>
                <input
                  type="text"
                  value={formState.displayName || ''}
                  onChange={(e) => setFormState({ ...formState, displayName: e.target.value })}
                  placeholder="e.g., Jordan Mercer (Synthetic Demo)"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Record ID</label>
                <input
                  type="text"
                  value={formState.mrnLabel || ''}
                  onChange={(e) => setFormState({ ...formState, mrnLabel: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Age / Sex</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    placeholder="Age"
                    value={formState.age ?? ''}
                    onChange={(e) =>
                      setFormState({
                        ...formState,
                        age: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-1/2 px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                  />
                  <select
                    value={formState.sex || 'UNKNOWN'}
                    onChange={(e) => setFormState({ ...formState, sex: e.target.value as any })}
                    className="w-1/2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="OTHER">Other</option>
                    <option value="UNKNOWN">Unknown</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Primary Diagnosis *
                </label>
                <input
                  type="text"
                  value={formState.primaryDiagnosis || ''}
                  onChange={(e) => setFormState({ ...formState, primaryDiagnosis: e.target.value })}
                  placeholder="e.g., Non-Small Cell Lung Cancer"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Diagnosis Date</label>
                <input
                  type="date"
                  value={formState.diagnosisDate || ''}
                  onChange={(e) => setFormState({ ...formState, diagnosisDate: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Disease Stage</label>
                <input
                  type="text"
                  value={formState.diseaseStage || ''}
                  onChange={(e) => setFormState({ ...formState, diseaseStage: e.target.value })}
                  placeholder="e.g., Stage IV"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ECOG Performance Status
                </label>
                <select
                  value={formState.ecogStatus ?? ''}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      ecogStatus: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">Not Documented (Missing)</option>
                  <option value="0">ECOG 0</option>
                  <option value="1">ECOG 1</option>
                  <option value="2">ECOG 2</option>
                  <option value="3">ECOG 3</option>
                  <option value="4">ECOG 4</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Previous Treatments (comma-separated)
                </label>
                <input
                  type="text"
                  value={treatmentsText}
                  onChange={(e) => setTreatmentsText(e.target.value)}
                  placeholder="e.g., FOLFOX, Carboplatin"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Medical History / Comorbidities
                </label>
                <input
                  type="text"
                  value={historyText}
                  onChange={(e) => setHistoryText(e.target.value)}
                  placeholder="e.g., Hypertension, Type 2 Diabetes"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Current Medications
                </label>
                <input
                  type="text"
                  value={medsText}
                  onChange={(e) => setMedsText(e.target.value)}
                  placeholder="e.g., Lisinopril 10mg"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Allergies</label>
                <input
                  type="text"
                  value={allergiesText}
                  onChange={(e) => setAllergiesText(e.target.value)}
                  placeholder="e.g., Penicillin"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Pathology & Molecular Biomarkers
              </label>
              <textarea
                rows={2}
                value={formState.pathologyInfo || ''}
                onChange={(e) => setFormState({ ...formState, pathologyInfo: e.target.value })}
                placeholder="Histology, NGS mutations (EGFR, KRAS, BRAF), PD-L1 CPS..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>

            {/* Laboratory Results Section */}
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-800">
                Laboratory Values & Test Dates ({(formState.labResults || []).length})
              </h4>
              {(formState.labResults || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(formState.labResults || []).map((lab) => (
                    <div
                      key={lab.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{lab.name}</p>
                        <p className="font-mono text-slate-600 tabular-nums">
                          {lab.value} {lab.unit} · {lab.testDate}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveLab(lab.id)}
                        className="text-slate-400 hover:text-rose-700 cursor-pointer"
                        aria-label={`Remove ${lab.name}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newLabKey}
                  onChange={(e) => setNewLabKey(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="anc">ANC (/µL)</option>
                  <option value="platelets">Platelets (/µL)</option>
                  <option value="hemoglobin">Hemoglobin (g/dL)</option>
                  <option value="egfr">eGFR (mL/min)</option>
                  <option value="ast">AST (U/L)</option>
                  <option value="alt">ALT (U/L)</option>
                  <option value="bilirubin">Total Bilirubin (mg/dL)</option>
                  <option value="lvef">LVEF (%)</option>
                  <option value="pdl1_cps">PD-L1 CPS</option>
                </select>
                <input
                  type="number"
                  step="any"
                  value={newLabVal}
                  onChange={(e) => setNewLabVal(e.target.value)}
                  placeholder="Value"
                  className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <input
                  type="date"
                  value={newLabDate}
                  onChange={(e) => setNewLabDate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddLab}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer"
                >
                  Add Lab
                </button>
              </div>
            </div>

            {/* Clinical Notes & File Upload (.txt / .pdf) */}
            <div className="pt-2 border-t border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-800">
                  Clinical Notes & Uploaded Sample Record (.TXT / .PDF)
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload TXT / PDF</span>
                  <input
                    type="file"
                    accept=".txt,.pdf,text/plain,application/pdf"
                    onChange={handleFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {uploadedDocName && (
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                  <span>Attached Source: {uploadedDocName}</span>
                </div>
              )}

              <textarea
                rows={4}
                value={formState.clinicalNotes || ''}
                onChange={(e) => setFormState({ ...formState, clinicalNotes: e.target.value })}
                placeholder="Paste synthetic consult notes, imaging summaries, or upload a .TXT / .PDF clinical record..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg leading-relaxed"
              />

              {/* Explicit AI Authorization Safeguard (Module 4 & 10) */}
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(formState.aiProcessingAuthorized)}
                  onChange={(e) =>
                    setFormState({ ...formState, aiProcessingAuthorized: e.target.checked })
                  }
                  className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                />
                <span>
                  <strong className="text-slate-900">Authorize AI Clinical Extraction:</strong> I confirm this record is synthetic or authorized for research pre-screening and consent to sending supplied clinical text/PDF to the server-side Gemini model.
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {saving ? 'Saving...' : 'Save Patient Profile'}
                </button>
                <button
                  type="button"
                  disabled={extracting || creatingNew}
                  onClick={handleExtractFacts}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {extracting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {extracting ? 'Extracting Facts...' : 'Extract Clinical Facts (Gemini AI)'}
                  </span>
                </button>
              </div>
              {!creatingNew && activePatient && (
                confirmDeleteId === activePatient.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-800 font-medium">Confirm delete?</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleDeletePatient(activePatient.id);
                        setConfirmDeleteId(null);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-700 text-white hover:bg-rose-800 cursor-pointer"
                    >
                      Yes, Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(activePatient.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 hover:text-rose-900 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Profile</span>
                  </button>
                )
              )}
            </div>
          </form>

          {/* Module 4: Extracted Facts Review Gate */}
          {!creatingNew && activePatient && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Extracted Clinical Facts & Provenance Review Gate ({currentFacts.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    {pendingCount > 0
                      ? `${pendingCount} extracted fact(s) require human verification before formal matching.`
                      : 'All extracted facts reviewed. Source quotes and temporal status preserved.'}
                  </p>
                </div>
              </div>

              {currentFacts.length === 0 ? (
                <p className="text-xs text-slate-500 py-4">
                  No extracted clinical facts yet. Add notes or upload a record and click "Extract Clinical Facts (Gemini AI)".
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                  {currentFacts.map((fact) => {
                    const isEditing = editingFactId === fact.id;
                    return (
                      <div key={fact.id} className="p-3.5 text-xs space-y-2 bg-white">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{fact.label}</span>
                            <span className="font-mono text-slate-500">[{fact.category}]</span>
                            <TemporalStatusTag status={fact.temporalStatus} />
                            <span className="font-mono text-slate-500">
                              Confidence: {fact.confidence}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded border font-medium ${
                              fact.reviewStatus === 'APPROVED' || fact.reviewStatus === 'EDITED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : fact.reviewStatus === 'REJECTED'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {fact.reviewStatus.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {isEditing ? (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={factEditValue}
                                onChange={(e) => setFactEditValue(e.target.value)}
                                className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                              />
                              <select
                                value={factEditTemporal}
                                onChange={(e) => setFactEditTemporal(e.target.value as TemporalStatus)}
                                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                              >
                                <option value="CURRENT">Current</option>
                                <option value="HISTORICAL">Historical</option>
                                <option value="NEGATED">Negated / Absent</option>
                                <option value="UNCERTAIN">Uncertain</option>
                              </select>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReviewFact(fact, 'EDITED')}
                                className="px-3 py-1 bg-[#0F2942] text-white rounded font-semibold cursor-pointer"
                              >
                                Save & Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingFactId(null)}
                                className="px-3 py-1 border border-slate-300 bg-white rounded cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm font-medium text-slate-800">{fact.value}</p>
                        )}

                        <div className="p-2.5 rounded bg-slate-50 border border-slate-200 text-slate-600">
                          <p className="italic">"{fact.exactSourceQuote}"</p>
                          <p className="mt-1 font-mono text-[11px] text-slate-500">
                            Source: {fact.sourceLocation} · Method: {fact.extractionMethod}
                            {fact.testDate ? ` · Date: ${fact.testDate}` : ''}
                          </p>
                        </div>

                        {fact.uncertaintyNote && (
                          <p className="text-amber-800">Uncertainty Note: {fact.uncertaintyNote}</p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleReviewFact(fact, 'APPROVED')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                            <span>Confirm Extracted Information</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFactId(fact.id);
                              setFactEditValue(fact.value);
                              setFactEditTemporal(fact.temporalStatus);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit Information</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewFact(fact, 'REJECTED')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 font-medium cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                            <span>Reject Extraction</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
