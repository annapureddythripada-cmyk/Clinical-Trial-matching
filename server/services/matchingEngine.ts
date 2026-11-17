import type {
  ClinicalTrial,
  CriterionEvaluation,
  CriterionMatchStatus,
  ExtractedClinicalFact,
  MissingInfoItem,
  OverallMatchOutcome,
  PatientProfile,
  ScreeningMatch,
  TrialCriterion,
} from '../../src/types/clinical.ts';

function normalize(text: string | null | undefined): string {
  return (text || '').toLowerCase().trim();
}

function daysBetween(dateStr: string, refDate = new Date('2026-11-17T00:00:00Z')): number | null {
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((refDate.getTime() - parsed) / (1000 * 60 * 60 * 24));
}

function getApprovedFacts(patient: PatientProfile): ExtractedClinicalFact[] {
  // Only facts reviewed/approved/edited (or synthetic demo approved) are used for formal matching;
  // pending/rejected facts are excluded to enforce the human review gate.
  return patient.extractedFacts.filter(
    (f) => f.reviewStatus === 'APPROVED' || f.reviewStatus === 'EDITED',
  );
}

function buildMissingItem(
  criterion: TrialCriterion,
  gapDescription: string,
  docNeeded: string,
): MissingInfoItem {
  return {
    id: `miss-${criterion.id}`,
    criterionId: criterion.id,
    requiredCategory: criterion.category,
    documentationNeeded: docNeeded,
    reasonFromCriterion: `${criterion.sourceSection}: "${criterion.originalText}"`,
    currentRecordGap: gapDescription,
    clinicalTeamActionNote:
      'Documentation gap identified for pre-screening only. The treating clinical team must determine whether obtaining or updating this record is clinically appropriate.',
  };
}

export function evaluateCriterionDeterministic(
  criterion: TrialCriterion,
  patient: PatientProfile,
  approvedFacts: ExtractedClinicalFact[],
): { evaluation: CriterionEvaluation; missingItem?: MissingInfoItem } {
  const baseEval = {
    id: `eval-${criterion.id}-${patient.id}`,
    criterionId: criterion.id,
    criterionType: criterion.criterionType,
    category: criterion.category,
    originalCriterionText: criterion.originalText,
    sourceSection: criterion.sourceSection,
    requiresHumanConfirmation: true,
  };

  // 1. AGE evaluation
  if (criterion.category === 'AGE') {
    if (patient.age === null || patient.age === undefined) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: 'Age / Date of Birth not recorded in patient profile.',
          evidenceSourceRef: `Patient Profile (${patient.mrnLabel})`,
          explanation: 'Cannot verify age eligibility because patient age is missing.',
          confidence: 'LOW',
          uncertaintyNote: 'Missing demographic age or date of birth.',
        },
        missingItem: buildMissingItem(
          criterion,
          'Patient age or date of birth is absent from demographic record.',
          'Verified Date of Birth / Age record',
        ),
      };
    }

    const minOk = criterion.minValue == null || patient.age >= criterion.minValue;
    const maxOk = criterion.maxValue == null || patient.age <= criterion.maxValue;
    const met = minOk && maxOk;

    return {
      evaluation: {
        ...baseEval,
        status: met ? 'MET' : 'NOT_MET',
        evaluationMethod: 'DETERMINISTIC_RULE',
        patientEvidence: `Age ${patient.age} years${patient.dateOfBirth ? ` (DOB: ${patient.dateOfBirth})` : ''}`,
        evidenceSourceRef: `Demographics (${patient.mrnLabel})`,
        explanation: met
          ? `Patient age (${patient.age} yrs) satisfies protocol threshold (${criterion.minValue ?? 0}+ yrs).`
          : `Patient age (${patient.age} yrs) falls outside protocol threshold (${criterion.minValue ?? 0}–${criterion.maxValue ?? '∞'} yrs).`,
        confidence: 'HIGH',
      },
    };
  }

  // 2. PERFORMANCE STATUS (ECOG)
  if (criterion.category === 'PERFORMANCE_STATUS') {
    const ecogFacts = approvedFacts.filter(
      (f) => f.category === 'performance_status' && f.numericValue !== null && f.numericValue !== undefined,
    );
    const distinctValues = Array.from(new Set(ecogFacts.map((f) => f.numericValue as number)));

    if (distinctValues.length > 1) {
      const citations = ecogFacts.map((f) => `${f.value} (${f.sourceLocation})`).join(' vs. ');
      return {
        evaluation: {
          ...baseEval,
          status: 'CONFLICTING',
          evaluationMethod: 'CONFLICT_DETECTOR',
          patientEvidence: citations,
          evidenceSourceRef: ecogFacts.map((f) => f.sourceLocation).join('; '),
          explanation: `Conflicting performance status documented across clinical records (${citations}). Physician reconciliation is required.`,
          confidence: 'LOW',
          uncertaintyNote: 'Multiple discordant ECOG scores found in approved chart facts.',
        },
      };
    }

    const ecogVal = distinctValues.length === 1 ? distinctValues[0] : patient.ecogStatus;
    if (ecogVal === null || ecogVal === undefined) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: 'No ECOG performance status recorded.',
          evidenceSourceRef: `Patient Profile (${patient.mrnLabel})`,
          explanation: 'ECOG performance status is required by the protocol but missing from supplied records.',
          confidence: 'LOW',
          uncertaintyNote: 'Missing performance status assessment.',
        },
        missingItem: buildMissingItem(
          criterion,
          'ECOG performance status is not documented.',
          'Current clinical note documenting ECOG performance status',
        ),
      };
    }

    const maxAllowed = criterion.maxValue ?? 1;
    const met = ecogVal <= maxAllowed;
    const sourceRef =
      ecogFacts[0]?.sourceLocation || `Clinical Profile (${patient.mrnLabel})`;

    return {
      evaluation: {
        ...baseEval,
        status: met ? 'MET' : 'NOT_MET',
        evaluationMethod: 'DETERMINISTIC_RULE',
        patientEvidence: `ECOG Performance Status: ${ecogVal}`,
        evidenceSourceRef: sourceRef,
        explanation: met
          ? `Recorded ECOG status (${ecogVal}) meets protocol threshold (<= ${maxAllowed}).`
          : `Recorded ECOG status (${ecogVal}) exceeds maximum allowed threshold (<= ${maxAllowed}).`,
        confidence: 'HIGH',
      },
    };
  }

  // 3. LAB THRESHOLD & QUANTITATIVE BIOMARKER (e.g. PD-L1 CPS, LVEF, ANC, Platelets)
  if (criterion.category === 'LAB_THRESHOLD' || (criterion.targetParameter === 'pdl1_cps')) {
    const paramKey = normalize(criterion.targetParameter);

    // Check matching labs
    const matchingLab = patient.labResults.find(
      (l) => normalize(l.parameterKey) === paramKey || normalize(l.name).includes(paramKey),
    );

    // Check matching approved extracted facts (e.g. pending PD-L1 CPS or lab extracted from note)
    const matchingFacts = approvedFacts.filter(
      (f) =>
        (f.category === 'lab_value' || f.category === 'biomarker') &&
        (normalize(f.label).includes(paramKey.replace('_', ' ')) ||
          normalize(f.label).includes(paramKey) ||
          normalize(f.value).includes(paramKey.replace('_', ' '))),
    );

    if (!matchingLab && matchingFacts.length === 0) {
      const labelMap: Record<string, string> = {
        anc: 'Absolute Neutrophil Count (ANC / CBC with differential)',
        platelets: 'Platelet Count (CBC)',
        hemoglobin: 'Hemoglobin (CBC)',
        egfr: 'Renal Function Panel (eGFR / Serum Creatinine)',
        ast: 'Hepatic Function Panel (AST)',
        alt: 'Hepatic Function Panel (ALT)',
        bilirubin: 'Total Bilirubin (Hepatic Panel)',
        lvef: 'Cardiac Assessment (Echocardiogram / MUGA LVEF)',
        pdl1_cps: 'Pathology Biomarker Addendum (PD-L1 CPS score)',
      };
      const docName = labelMap[paramKey] || `Laboratory / Diagnostic Report for ${criterion.targetParameter}`;
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: `No result available for "${criterion.targetParameter}".`,
          evidenceSourceRef: `Lab & Pathology Records (${patient.mrnLabel})`,
          explanation: `Protocol requires ${criterion.originalText}, but no corresponding value was found in supplied patient records.`,
          confidence: 'LOW',
          uncertaintyNote: `Missing ${docName}.`,
        },
        missingItem: buildMissingItem(
          criterion,
          `No recent result documented for ${criterion.targetParameter}.`,
          docName,
        ),
      };
    }

    // If fact explicitly marked UNCERTAIN (e.g., pending PD-L1 CPS)
    const uncertainFact = matchingFacts.find((f) => f.temporalStatus === 'UNCERTAIN');
    if (!matchingLab && uncertainFact) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: uncertainFact.value,
          evidenceSourceRef: uncertainFact.sourceLocation,
          explanation: `Referenced record indicates "${uncertainFact.value}". Result is pending or uncertain.`,
          confidence: 'LOW',
          uncertaintyNote: uncertainFact.uncertaintyNote || 'Pending test/pathology addendum.',
        },
        missingItem: buildMissingItem(
          criterion,
          uncertainFact.value,
          `${uncertainFact.label} finalized report`,
        ),
      };
    }

    const numericVal =
      matchingLab?.value ?? matchingFacts.find((f) => f.numericValue != null)?.numericValue ?? null;

    if (numericVal === null) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: matchingFacts[0]?.value || 'Unparsed value',
          evidenceSourceRef: matchingFacts[0]?.sourceLocation || 'Chart',
          explanation: 'Quantitative value could not be deterministically parsed for threshold comparison.',
          confidence: 'LOW',
          uncertaintyNote: 'Requires manual review of source document.',
        },
        missingItem: buildMissingItem(
          criterion,
          'Quantitative measurement unclear in record.',
          `Verified quantitative report for ${criterion.targetParameter}`,
        ),
      };
    }

    // Check outdated lab (> 90 days)
    const testDate = matchingLab?.testDate || matchingFacts[0]?.testDate;
    const ageDays = testDate ? daysBetween(testDate) : null;
    if (ageDays !== null && ageDays > 90) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: `${numericVal} ${matchingLab?.unit || criterion.unit || ''} (dated ${testDate}, ${ageDays} days old)`,
          evidenceSourceRef: matchingLab?.sourceLocation || 'Lab Panel',
          explanation: `Available result (${numericVal}) is ${ageDays} days old (> 90 days) and may be outdated for screening.`,
          confidence: 'LOW',
          uncertaintyNote: 'Outdated laboratory result (> 90 days prior to current date).',
        },
        missingItem: buildMissingItem(
          criterion,
          `Existing result dated ${testDate} is over 90 days old.`,
          `Updated ${criterion.targetParameter.toUpperCase()} result`,
        ),
      };
    }

    let met = true;
    if (criterion.ruleOperator === 'GTE' && criterion.minValue != null) {
      met = numericVal >= criterion.minValue;
    } else if (criterion.ruleOperator === 'LTE' && criterion.maxValue != null) {
      met = numericVal <= criterion.maxValue;
    } else if (criterion.ruleOperator === 'BETWEEN') {
      met =
        (criterion.minValue == null || numericVal >= criterion.minValue) &&
        (criterion.maxValue == null || numericVal <= criterion.maxValue);
    }

    if (criterion.criterionType === 'EXCLUSION') {
      met = !met;
    }

    const unit = matchingLab?.unit || criterion.unit || '';
    const refStr = matchingLab?.sourceLocation || matchingFacts[0]?.sourceLocation || 'Lab Report';

    return {
      evaluation: {
        ...baseEval,
        status: met ? 'MET' : 'NOT_MET',
        evaluationMethod: 'DETERMINISTIC_RULE',
        patientEvidence: `${matchingLab?.name || criterion.targetParameter}: ${numericVal} ${unit}${testDate ? ` (${testDate})` : ''}`,
        evidenceSourceRef: refStr,
        explanation: met
          ? `Observed value (${numericVal} ${unit}) satisfies protocol threshold (${criterion.originalText}).`
          : `Observed value (${numericVal} ${unit}) does not meet protocol threshold (${criterion.originalText}).`,
        confidence: 'HIGH',
      },
    };
  }

  // 4. DIAGNOSIS / DISEASE STAGE / BIOMARKER
  if (criterion.category === 'DIAGNOSIS' || criterion.category === 'DISEASE_STAGE') {
    const keywords = (criterion.expectedKeywords || []).map(normalize).filter(Boolean);
    const corpus = [
      patient.primaryDiagnosis,
      patient.diseaseStage,
      patient.pathologyInfo,
      ...approvedFacts
        .filter((f) => f.temporalStatus === 'CURRENT' && ['diagnosis', 'disease_stage', 'biomarker'].includes(f.category))
        .map((f) => `${f.label}: ${f.value}`),
    ]
      .join(' | ')
      .toLowerCase();

    const uncertainFacts = approvedFacts.filter(
      (f) =>
        f.temporalStatus === 'UNCERTAIN' &&
        keywords.some((kw) => normalize(f.label + ' ' + f.value).includes(kw)),
    );

    if (uncertainFacts.length > 0) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: uncertainFacts[0].value,
          evidenceSourceRef: uncertainFacts[0].sourceLocation,
          explanation: `Record indicates uncertainty or pending confirmation: "${uncertainFacts[0].value}".`,
          confidence: 'LOW',
          uncertaintyNote: uncertainFacts[0].uncertaintyNote || 'Pending diagnostic/pathology confirmation.',
        },
        missingItem: buildMissingItem(
          criterion,
          uncertainFacts[0].value,
          'Confirmed pathology / molecular biomarker report',
        ),
      };
    }

    if (!patient.primaryDiagnosis.trim() && approvedFacts.length === 0) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: 'No diagnosis or pathology data provided.',
          evidenceSourceRef: `Patient Profile (${patient.mrnLabel})`,
          explanation: 'Diagnosis and staging details are missing.',
          confidence: 'LOW',
        },
        missingItem: buildMissingItem(
          criterion,
          'Primary diagnosis and histology are undocumented.',
          'Histological pathology & staging summary',
        ),
      };
    }

    const matchedKeywords = keywords.filter((kw) => corpus.includes(kw));
    if (matchedKeywords.length > 0) {
      const evidenceSource =
        approvedFacts.find((f) => matchedKeywords.some((kw) => normalize(f.value).includes(kw)))?.sourceLocation ||
        `Diagnosis & Pathology (${patient.mrnLabel})`;
      return {
        evaluation: {
          ...baseEval,
          status: 'MET',
          evaluationMethod: 'DETERMINISTIC_RULE',
          patientEvidence: `${patient.primaryDiagnosis}${patient.diseaseStage ? ` · ${patient.diseaseStage}` : ''}`,
          evidenceSourceRef: evidenceSource,
          explanation: `Patient diagnosis/pathology aligns with protocol requirement (matched terms: ${matchedKeywords.join(', ')}).`,
          confidence: 'HIGH',
        },
      };
    }

    // Special check for missing biomarker vs mismatched primary diagnosis
    if (criterion.targetParameter === 'biomarker' && !patient.pathologyInfo.trim()) {
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: 'Molecular/biomarker pathology report not available.',
          evidenceSourceRef: `Pathology (${patient.mrnLabel})`,
          explanation: 'Required molecular biomarker status could not be confirmed due to missing pathology report.',
          confidence: 'LOW',
        },
        missingItem: buildMissingItem(
          criterion,
          'Molecular biomarker testing results not supplied.',
          'Molecular / NGS pathology report',
        ),
      };
    }

    return {
      evaluation: {
        ...baseEval,
        status: criterion.criterionType === 'EXCLUSION' ? 'MET' : 'NOT_MET',
        evaluationMethod: 'DETERMINISTIC_RULE',
        patientEvidence: `${patient.primaryDiagnosis} (${patient.diseaseStage})`,
        evidenceSourceRef: `Clinical Profile (${patient.mrnLabel})`,
        explanation:
          criterion.criterionType === 'EXCLUSION'
            ? 'Excluded condition not observed in documented diagnosis.'
            : `Documented diagnosis (${patient.primaryDiagnosis}) does not match required condition/biomarker (${keywords.join(', ') || criterion.originalText}).`,
        confidence: 'MODERATE',
      },
    };
  }

  // 5. PREVIOUS TREATMENT / MEDICATION / COMORBIDITY
  if (
    criterion.category === 'PREVIOUS_TREATMENT' ||
    criterion.category === 'COMORBIDITY' ||
    criterion.category === 'MEDICATION'
  ) {
    const keywords = (criterion.expectedKeywords || []).map(normalize).filter(Boolean);
    const relevantFacts = approvedFacts.filter((f) =>
      keywords.some((kw) => normalize(`${f.label} ${f.value} ${f.exactSourceQuote}`).includes(kw)),
    );

    const hasCurrentOrHistorical = relevantFacts.some(
      (f) => f.temporalStatus === 'CURRENT' || f.temporalStatus === 'HISTORICAL',
    );
    const hasNegated = relevantFacts.some((f) => f.temporalStatus === 'NEGATED');
    const hasUncertain = relevantFacts.some((f) => f.temporalStatus === 'UNCERTAIN');

    // Conflict detection: both negated AND current/historical approved facts for the same concept
    if (hasCurrentOrHistorical && hasNegated) {
      const posFact = relevantFacts.find((f) => f.temporalStatus === 'CURRENT' || f.temporalStatus === 'HISTORICAL')!;
      const negFact = relevantFacts.find((f) => f.temporalStatus === 'NEGATED')!;
      return {
        evaluation: {
          ...baseEval,
          status: 'CONFLICTING',
          evaluationMethod: 'CONFLICT_DETECTOR',
          patientEvidence: `"${negFact.value}" (${negFact.sourceLocation}) vs. "${posFact.value}" (${posFact.sourceLocation})`,
          evidenceSourceRef: `${negFact.sourceLocation}; ${posFact.sourceLocation}`,
          explanation: `Conflicting clinical evidence detected across chart documents. One record negates the finding while another documents active/present disease.`,
          confidence: 'LOW',
          uncertaintyNote: 'Requires clinician reconciliation of discordant clinical notes/imaging.',
        },
      };
    }

    if (hasUncertain) {
      const unc = relevantFacts.find((f) => f.temporalStatus === 'UNCERTAIN')!;
      return {
        evaluation: {
          ...baseEval,
          status: 'UNKNOWN',
          evaluationMethod: 'GAP_DETECTOR',
          patientEvidence: unc.value,
          evidenceSourceRef: unc.sourceLocation,
          explanation: `Clinical record expresses uncertainty regarding this criterion: "${unc.value}".`,
          confidence: 'LOW',
          uncertaintyNote: unc.uncertaintyNote || 'Uncertain clinical finding.',
        },
        missingItem: buildMissingItem(
          criterion,
          unc.value,
          `Clarifying clinical or imaging record for: ${criterion.originalText}`,
        ),
      };
    }

    const structuredList = [
      ...patient.previousTreatments,
      ...patient.medicalHistory,
      ...patient.medications,
    ]
      .join(' | ')
      .toLowerCase();
    const matchedInStructured = keywords.some((kw) => structuredList.includes(kw));

    if (criterion.criterionType === 'EXCLUSION') {
      if (hasCurrentOrHistorical || matchedInStructured) {
        const hitFact = relevantFacts.find((f) => f.temporalStatus !== 'NEGATED');
        return {
          evaluation: {
            ...baseEval,
            status: 'NOT_MET',
            evaluationMethod: 'DETERMINISTIC_RULE',
            patientEvidence: hitFact
              ? `${hitFact.value} ("${hitFact.exactSourceQuote}")`
              : `Documented in chart history: ${[...patient.previousTreatments, ...patient.medicalHistory].join(', ')}`,
            evidenceSourceRef: hitFact?.sourceLocation || `Patient History (${patient.mrnLabel})`,
            explanation: `Exclusion condition appears present in patient history/records, making this exclusion criterion NOT MET.`,
            confidence: 'HIGH',
          },
        };
      }

      if (hasNegated) {
        const negFact = relevantFacts.find((f) => f.temporalStatus === 'NEGATED')!;
        return {
          evaluation: {
            ...baseEval,
            status: 'MET',
            evaluationMethod: 'DETERMINISTIC_RULE',
            patientEvidence: `${negFact.value} ("${negFact.exactSourceQuote}")`,
            evidenceSourceRef: negFact.sourceLocation,
            explanation: `Clinical record explicitly documents absence of the excluded condition/treatment.`,
            confidence: 'HIGH',
          },
        };
      }

      if (!patient.clinicalNotes.trim() && patient.medicalHistory.length === 0) {
        return {
          evaluation: {
            ...baseEval,
            status: 'UNKNOWN',
            evaluationMethod: 'GAP_DETECTOR',
            patientEvidence: 'Insufficient medical/treatment history supplied.',
            evidenceSourceRef: `Patient Profile (${patient.mrnLabel})`,
            explanation: 'Cannot confirm absence of exclusion condition without medical/treatment history.',
            confidence: 'LOW',
          },
          missingItem: buildMissingItem(
            criterion,
            'Medical and prior therapy history is empty.',
            `History documentation addressing: ${criterion.originalText}`,
          ),
        };
      }

      return {
        evaluation: {
          ...baseEval,
          status: 'MET',
          evaluationMethod: 'DETERMINISTIC_RULE',
          patientEvidence: 'Not reported in documented medical history, medications, or clinical notes.',
          evidenceSourceRef: `Patient History & Notes (${patient.mrnLabel})`,
          explanation:
            'No evidence of the excluded condition/treatment found in supplied records; coordinator should verify directly with patient/chart.',
          confidence: 'MODERATE',
          uncertaintyNote: 'Absence inferred from non-mention; requires human verification.',
        },
      };
    }

    // INCLUSION for previous treatment / comorbidity / medication
    if (hasCurrentOrHistorical || matchedInStructured) {
      const hitFact = relevantFacts.find((f) => f.temporalStatus !== 'NEGATED');
      return {
        evaluation: {
          ...baseEval,
          status: 'MET',
          evaluationMethod: 'DETERMINISTIC_RULE',
          patientEvidence: hitFact
            ? hitFact.value
            : patient.previousTreatments.join(', ') || patient.medicalHistory.join(', '),
          evidenceSourceRef: hitFact?.sourceLocation || `Treatment History (${patient.mrnLabel})`,
          explanation: `Patient record documents required prior treatment/condition.`,
          confidence: 'HIGH',
        },
      };
    }

    if (hasNegated || patient.previousTreatments.length > 0 || patient.clinicalNotes.toLowerCase().includes('no prior')) {
      const negFact = relevantFacts.find((f) => f.temporalStatus === 'NEGATED');
      return {
        evaluation: {
          ...baseEval,
          status: 'NOT_MET',
          evaluationMethod: 'DETERMINISTIC_RULE',
          patientEvidence: negFact
            ? `${negFact.value} ("${negFact.exactSourceQuote}")`
            : `Documented treatments: ${patient.previousTreatments.join(', ') || 'None'}`,
          evidenceSourceRef: negFact?.sourceLocation || `Treatment History (${patient.mrnLabel})`,
          explanation: `Required prior therapy/condition is absent or explicitly negated in patient records.`,
          confidence: 'HIGH',
        },
      };
    }

    return {
      evaluation: {
        ...baseEval,
        status: 'UNKNOWN',
        evaluationMethod: 'GAP_DETECTOR',
        patientEvidence: 'Prior treatment history not clearly documented.',
        evidenceSourceRef: `Patient Profile (${patient.mrnLabel})`,
        explanation: 'Cannot determine whether required prior treatment criterion is met.',
        confidence: 'LOW',
      },
      missingItem: buildMissingItem(
        criterion,
        'Prior systemic therapy history is incomplete.',
        'Oncology treatment history summary',
      ),
    };
  }

  // 6. OTHER / COMPLEX CRITERIA -> Human Review Required
  return {
    evaluation: {
      ...baseEval,
      status: 'UNKNOWN',
      evaluationMethod: 'GAP_DETECTOR',
      patientEvidence: 'Complex or qualitative protocol requirement.',
      evidenceSourceRef: `Protocol (${criterion.sourceSection})`,
      explanation:
        criterion.reviewNote ||
        'Criterion requires human clinical interpretation rather than automated threshold evaluation.',
      confidence: 'LOW',
      uncertaintyNote: 'Requires human clinical review.',
    },
    missingItem: buildMissingItem(
      criterion,
      'Qualitative criterion requires clinical verification.',
      `Clinical verification for: ${criterion.originalText}`,
    ),
  };
}

export function computeOverallOutcome(evaluations: CriterionEvaluation[]): OverallMatchOutcome {
  const effectiveStatuses = evaluations.map((e) => e.reviewerOverrideStatus ?? e.status);
  const hasConflictOrNotMet = effectiveStatuses.some((s) => s === 'CONFLICTING' || s === 'NOT_MET');
  if (hasConflictOrNotMet) {
    return 'REQUIRES_REVIEW';
  }
  const hasUnknown = effectiveStatuses.some((s) => s === 'UNKNOWN');
  if (hasUnknown) {
    return 'INSUFFICIENT_INFORMATION';
  }
  return 'POTENTIAL_PRE_SCREENING_MATCH';
}

export function computeSummaryCounts(evaluations: CriterionEvaluation[]) {
  const effective = evaluations.map((e) => e.reviewerOverrideStatus ?? e.status);
  return {
    met: effective.filter((s) => s === 'MET').length,
    notMet: effective.filter((s) => s === 'NOT_MET').length,
    unknown: effective.filter((s) => s === 'UNKNOWN').length,
    conflicting: effective.filter((s) => s === 'CONFLICTING').length,
    total: effective.length,
  };
}

export function runPatientTrialMatch(
  patient: PatientProfile,
  trial: ClinicalTrial,
  options?: { isDemoGenerated?: boolean; existingMatchId?: string },
): ScreeningMatch {
  const approvedFacts = getApprovedFacts(patient);
  const criteria =
    trial.structuredCriteria.length > 0
      ? trial.structuredCriteria
      : parseCriteriaRuleBased(trial);

  const evaluations: CriterionEvaluation[] = [];
  const missingDocumentation: MissingInfoItem[] = [];

  for (const criterion of criteria) {
    const res = evaluateCriterionDeterministic(criterion, patient, approvedFacts);
    evaluations.push(res.evaluation);
    if (res.missingItem) {
      missingDocumentation.push(res.missingItem);
    }
  }

  const overallOutcome = computeOverallOutcome(evaluations);
  const summaryCounts = computeSummaryCounts(evaluations);
  const now = new Date().toISOString();
  const primaryLoc = trial.locations[0]
    ? `${trial.locations[0].city}${trial.locations[0].state ? `, ${trial.locations[0].state}` : ''}, ${trial.locations[0].country}`
    : 'Location not listed in registry';

  return {
    id: options?.existingMatchId || `match-${patient.id}-${trial.id}`,
    patientId: patient.id,
    patientName: patient.displayName,
    patientMrnLabel: patient.mrnLabel,
    trialId: trial.id,
    nctId: trial.nctId,
    trialTitle: trial.briefTitle || trial.title,
    trialCondition: trial.conditions[0] || 'Unspecified Condition',
    trialPhase: trial.phase,
    recruitmentStatus: trial.recruitmentStatus,
    trialLocationSummary: primaryLoc,
    trialDataOrigin: trial.dataOrigin,
    overallOutcome,
    requiresHumanConfirmation: true,
    reviewStatus: 'PENDING_REVIEW',
    isDemoGenerated: Boolean(options?.isDemoGenerated),
    summaryCounts,
    evaluations,
    missingDocumentation,
    reviewerComments: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Deterministic fallback criteria parser for live ClinicalTrials.gov protocols
 * prior to Gemini structured extraction. Preserves exact wording and marks ambiguous items for human review.
 */
export function parseCriteriaRuleBased(trial: ClinicalTrial): TrialCriterion[] {
  const lines = trial.eligibilityCriteriaRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8);

  const criteria: TrialCriterion[] = [];
  let currentType: 'INCLUSION' | 'EXCLUSION' = 'INCLUSION';
  let incIdx = 0;
  let excIdx = 0;

  // Always add age criterion if minAgeYears present
  if (trial.minAgeYears != null) {
    criteria.push({
      id: `crit-${trial.id}-age`,
      trialId: trial.id,
      criterionType: 'INCLUSION',
      category: 'AGE',
      originalText: `Minimum eligible age: ${trial.minAgeYears} years${trial.maxAgeYears ? ` (Maximum: ${trial.maxAgeYears} years)` : ''}`,
      sourceSection: 'Registry Eligibility Demographics',
      ruleOperator: trial.maxAgeYears ? 'BETWEEN' : 'GTE',
      targetParameter: 'age',
      minValue: trial.minAgeYears,
      maxValue: trial.maxAgeYears ?? null,
      unit: 'years',
      requiresHumanReview: false,
    });
  }

  for (const rawLine of lines) {
    const lower = rawLine.toLowerCase();
    if (/^inclusion criteria/i.test(lower)) {
      currentType = 'INCLUSION';
      continue;
    }
    if (/^exclusion criteria/i.test(lower)) {
      currentType = 'EXCLUSION';
      continue;
    }
    if (criteria.length >= 12) break;

    const clean = rawLine.replace(/^[-*•\d.)]+\s*/, '').trim();
    if (clean.length < 10) continue;

    if (currentType === 'INCLUSION') incIdx += 1;
    else excIdx += 1;
    const section = `${currentType === 'INCLUSION' ? 'Inclusion' : 'Exclusion'} Criteria #${currentType === 'INCLUSION' ? incIdx : excIdx}`;

    if (/ecog/i.test(clean)) {
      const m = clean.match(/ecog[^0-9]*([0-4])/i);
      criteria.push({
        id: `crit-${trial.id}-${criteria.length + 1}`,
        trialId: trial.id,
        criterionType: currentType,
        category: 'PERFORMANCE_STATUS',
        originalText: clean,
        sourceSection: section,
        ruleOperator: 'LTE',
        targetParameter: 'ecogStatus',
        maxValue: m ? Number(m[1]) : 1,
        unit: 'ECOG',
        requiresHumanReview: !m,
        reviewNote: m ? null : 'Verify allowed ECOG performance status range.',
      });
      continue;
    }

    if (/anc|neutrophil|platelet|hemoglobin|egfr|bilirubin|ast\b|alt\b|creatinine/i.test(clean)) {
      let param = 'lab';
      if (/anc|neutrophil/i.test(clean)) param = 'anc';
      else if (/platelet/i.test(clean)) param = 'platelets';
      else if (/hemoglobin/i.test(clean)) param = 'hemoglobin';
      else if (/egfr/i.test(clean)) param = 'egfr';
      else if (/bilirubin/i.test(clean)) param = 'bilirubin';
      else if (/\bast\b/i.test(clean)) param = 'ast';
      else if (/\balt\b/i.test(clean)) param = 'alt';

      const numMatch = clean.match(/(?:>=|<=|>|<|≥|≤|at least)\s*([\d,.]+)/i);
      const val = numMatch ? Number(numMatch[1].replace(/,/g, '')) : null;
      const isMax = /<=|≤|<|less than|below/i.test(clean);

      criteria.push({
        id: `crit-${trial.id}-${criteria.length + 1}`,
        trialId: trial.id,
        criterionType: currentType,
        category: 'LAB_THRESHOLD',
        originalText: clean,
        sourceSection: section,
        ruleOperator: val != null ? (isMax ? 'LTE' : 'GTE') : 'COMPLEX_HUMAN_REVIEW',
        targetParameter: param,
        minValue: val != null && !isMax ? val : null,
        maxValue: val != null && isMax ? val : null,
        requiresHumanReview: val == null,
        reviewNote: val == null ? 'Use AI Criteria Extraction or manual review to confirm numeric threshold.' : null,
      });
      continue;
    }

    if (/histolog|confirmed|stage|metastatic|carcinoma|melanoma|leukemia|lymphoma|breast|lung/i.test(clean)) {
      const keywords = trial.conditions.map((c) => c.toLowerCase());
      criteria.push({
        id: `crit-${trial.id}-${criteria.length + 1}`,
        trialId: trial.id,
        criterionType: currentType,
        category: 'DIAGNOSIS',
        originalText: clean,
        sourceSection: section,
        ruleOperator: 'INCLUDES',
        targetParameter: 'diagnosis',
        expectedKeywords: keywords.length > 0 ? keywords : [clean.slice(0, 32).toLowerCase()],
        requiresHumanReview: true,
        reviewNote: 'Confirm histology, stage, and molecular markers against pathology report.',
      });
      continue;
    }

    criteria.push({
      id: `crit-${trial.id}-${criteria.length + 1}`,
      trialId: trial.id,
      criterionType: currentType,
      category: currentType === 'EXCLUSION' ? 'COMORBIDITY' : 'OTHER',
      originalText: clean,
      sourceSection: section,
      ruleOperator: 'COMPLEX_HUMAN_REVIEW',
      targetParameter: 'manual_review',
      requiresHumanReview: true,
      reviewNote: 'Run Gemini Criteria Extraction or review manually.',
    });
  }

  return criteria;
}
