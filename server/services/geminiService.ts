import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import type {
  ClinicalTrial,
  CriterionEvaluation,
  ExtractedClinicalFact,
  PatientProfile,
  TrialCriterion,
} from '../../src/types/clinical.ts';

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in server environment secrets. Add a valid key in Settings > Secrets to run live Gemini extraction.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('RESOURCE_EXHAUSTED');
      if (!isTransient || attempt === retries) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function extractPatientFactsWithGemini(params: {
  patientId: string;
  clinicalText?: string;
  pdfBase64?: string;
  documentName?: string;
}): Promise<ExtractedClinicalFact[]> {
  const ai = getGeminiClient();

  const systemInstruction = `You are a clinical research data extraction assistant for pre-screening decision support.
CRITICAL SAFETY RULES:
1. Extract ONLY facts explicitly stated in the supplied text or PDF document. NEVER invent, extrapolate, or assume missing information.
2. Preserve the EXACT verbatim supporting quote in "exactSourceQuote" and describe the location in "sourceLocation".
3. Explicitly classify "temporalStatus" as:
   - CURRENT: active present condition, current lab, current performance status
   - HISTORICAL: past resolved event or prior completed treatment
   - NEGATED: explicitly denied or absent (e.g. "no brain metastases", "no prior EGFR TKI")
   - UNCERTAIN: pending, suspected, unconfirmed, or contradictory
4. Represent uncertainty explicitly in "uncertaintyNote" and "confidence" (HIGH, MODERATE, LOW).
5. Extract numeric values and units accurately for labs, ECOG, age, or biomarker scores (e.g., PD-L1 CPS).`;

  const promptText = `Extract protocol-relevant clinical facts from the supplied clinical record (${params.documentName || 'Clinical Notes'}).
Categorize each fact as one of: diagnosis, disease_stage, medication, treatment_history, lab_value, biomarker, comorbidity, allergy, performance_status, demographic, other.
${params.clinicalText ? `\n--- CLINICAL TEXT ---\n${params.clinicalText}` : ''}`;

  const parts: Array<Record<string, any>> = [];
  if (params.pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: params.pdfBase64,
      },
    });
  }
  parts.push({ text: promptText });

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: {
                type: Type.STRING,
                description:
                  'One of: diagnosis, disease_stage, medication, treatment_history, lab_value, biomarker, comorbidity, allergy, performance_status, demographic, other',
              },
              label: { type: Type.STRING, description: 'Short clinical concept name' },
              value: { type: Type.STRING, description: 'Concise factual summary' },
              numericValue: { type: Type.NUMBER, nullable: true },
              unit: { type: Type.STRING, nullable: true },
              testDate: { type: Type.STRING, nullable: true, description: 'YYYY-MM-DD if stated' },
              temporalStatus: {
                type: Type.STRING,
                description: 'CURRENT, HISTORICAL, NEGATED, or UNCERTAIN',
              },
              confidence: { type: Type.STRING, description: 'HIGH, MODERATE, or LOW' },
              uncertaintyNote: { type: Type.STRING, nullable: true },
              exactSourceQuote: { type: Type.STRING, description: 'Exact verbatim quote from source' },
              sourceLocation: { type: Type.STRING, description: 'Section, line, or paragraph reference' },
            },
            required: ['category', 'label', 'value', 'temporalStatus', 'confidence', 'exactSourceQuote', 'sourceLocation'],
          },
        },
      },
    }),
  );

  const rawJson = (response.text ?? '[]').trim();
  const parsed = JSON.parse(rawJson) as Array<Record<string, any>>;

  const validCategories = new Set([
    'diagnosis',
    'disease_stage',
    'medication',
    'treatment_history',
    'lab_value',
    'biomarker',
    'comorbidity',
    'allergy',
    'performance_status',
    'demographic',
    'other',
  ]);
  const validTemporal = new Set(['CURRENT', 'HISTORICAL', 'NEGATED', 'UNCERTAIN']);
  const validConf = new Set(['HIGH', 'MODERATE', 'LOW']);

  return parsed.map((item, idx) => ({
    id: `fact-ai-${Date.now()}-${idx}`,
    patientId: params.patientId,
    category: validCategories.has(item.category) ? item.category : 'other',
    label: String(item.label || 'Extracted Clinical Fact'),
    value: String(item.value || ''),
    numericValue: typeof item.numericValue === 'number' ? item.numericValue : null,
    unit: item.unit ? String(item.unit) : null,
    testDate: item.testDate ? String(item.testDate) : null,
    temporalStatus: validTemporal.has(item.temporalStatus) ? item.temporalStatus : 'UNCERTAIN',
    confidence: validConf.has(item.confidence) ? item.confidence : 'MODERATE',
    uncertaintyNote: item.uncertaintyNote ? String(item.uncertaintyNote) : null,
    exactSourceQuote: String(item.exactSourceQuote || item.value || ''),
    sourceLocation: String(item.sourceLocation || params.documentName || 'Clinical Notes'),
    reviewStatus: 'PENDING_REVIEW',
    reviewedBy: null,
    reviewedAt: null,
    extractionMethod: 'GEMINI_AI',
  }));
}

export async function extractTrialCriteriaWithGemini(
  trial: ClinicalTrial,
): Promise<TrialCriterion[]> {
  const ai = getGeminiClient();

  const systemInstruction = `You are a clinical trial protocol structuring assistant.
Parse the raw clinical trial eligibility criteria into discrete, auditable conditions.
RULES:
1. Never invent protocol requirements not present in the source text.
2. Preserve the exact verbatim wording in "originalText" and cite the section in "sourceSection" (e.g., "Inclusion Criteria #2").
3. Categorize each criterion strictly as one of: AGE, DIAGNOSIS, DISEASE_STAGE, LAB_THRESHOLD, PREVIOUS_TREATMENT, COMORBIDITY, MEDICATION, PERFORMANCE_STATUS, OTHER.
4. Map "targetParameter" cleanly when quantitative (e.g., "age", "ecogStatus", "anc", "platelets", "hemoglobin", "egfr", "ast", "alt", "bilirubin", "lvef", "pdl1_cps", "diagnosis", "diseaseStage", "biomarker", "previousTreatments", "comorbidity").
5. If a criterion is subjective, ambiguous, or relies on investigator judgment, set "ruleOperator" to "COMPLEX_HUMAN_REVIEW" and "requiresHumanReview" to true with a clear "reviewNote".`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Trial: ${trial.nctId} — ${trial.title}\n\nRaw Eligibility Criteria:\n${trial.eligibilityCriteriaRaw}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              criterionType: { type: Type.STRING, description: 'INCLUSION or EXCLUSION' },
              category: {
                type: Type.STRING,
                description:
                  'AGE, DIAGNOSIS, DISEASE_STAGE, LAB_THRESHOLD, PREVIOUS_TREATMENT, COMORBIDITY, MEDICATION, PERFORMANCE_STATUS, or OTHER',
              },
              originalText: { type: Type.STRING },
              sourceSection: { type: Type.STRING },
              ruleOperator: {
                type: Type.STRING,
                description:
                  'GTE, LTE, BETWEEN, EQUALS, INCLUDES, EXCLUDES, BOOLEAN_PRESENT, or COMPLEX_HUMAN_REVIEW',
              },
              targetParameter: { type: Type.STRING },
              minValue: { type: Type.NUMBER, nullable: true },
              maxValue: { type: Type.NUMBER, nullable: true },
              unit: { type: Type.STRING, nullable: true },
              expectedKeywords: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              requiresHumanReview: { type: Type.BOOLEAN },
              reviewNote: { type: Type.STRING, nullable: true },
            },
            required: [
              'criterionType',
              'category',
              'originalText',
              'sourceSection',
              'ruleOperator',
              'targetParameter',
              'requiresHumanReview',
            ],
          },
        },
      },
    }),
  );

  const rawJson = (response.text ?? '[]').trim();
  const parsed = JSON.parse(rawJson) as Array<Record<string, any>>;

  return parsed.slice(0, 20).map((item, idx) => ({
    id: `crit-ai-${trial.id}-${idx + 1}`,
    trialId: trial.id,
    criterionType: item.criterionType === 'EXCLUSION' ? 'EXCLUSION' : 'INCLUSION',
    category: item.category || 'OTHER',
    originalText: String(item.originalText || ''),
    sourceSection: String(item.sourceSection || 'Protocol Eligibility'),
    ruleOperator: item.ruleOperator || 'COMPLEX_HUMAN_REVIEW',
    targetParameter: String(item.targetParameter || 'manual_review'),
    minValue: typeof item.minValue === 'number' ? item.minValue : null,
    maxValue: typeof item.maxValue === 'number' ? item.maxValue : null,
    unit: item.unit ? String(item.unit) : null,
    expectedKeywords: Array.isArray(item.expectedKeywords)
      ? item.expectedKeywords.map(String)
      : [],
    requiresHumanReview: Boolean(item.requiresHumanReview),
    reviewNote: item.reviewNote ? String(item.reviewNote) : null,
    reviewedByUser: false,
  }));
}

export async function evaluateComplexCriterionWithGemini(
  criterion: TrialCriterion,
  patient: PatientProfile,
): Promise<Partial<CriterionEvaluation>> {
  const ai = getGeminiClient();

  const approvedFacts = patient.extractedFacts.filter(
    (f) => f.reviewStatus === 'APPROVED' || f.reviewStatus === 'EDITED',
  );

  const systemInstruction = `You are a clinical pre-screening decision-support assistant.
Evaluate a single qualitative clinical trial criterion against approved patient facts.
RULES:
1. Return status strictly as MET, NOT_MET, UNKNOWN, or CONFLICTING.
2. NEVER convert missing/unknown evidence into NOT_MET — return UNKNOWN if evidence is absent or ambiguous.
3. If two approved records contradict each other, return CONFLICTING.
4. Cite exact patient evidence and source references. Do NOT make final medical eligibility decisions.`;

  const prompt = `Trial Criterion (${criterion.criterionType} — ${criterion.sourceSection}):
"${criterion.originalText}"

Patient Demographics & Structured Fields:
- Age: ${patient.age ?? 'Unknown'}, Sex: ${patient.sex}
- Diagnosis: ${patient.primaryDiagnosis}
- Stage: ${patient.diseaseStage}
- Pathology: ${patient.pathologyInfo}
- Prior Treatments: ${patient.previousTreatments.join('; ') || 'None documented'}
- Medical History: ${patient.medicalHistory.join('; ') || 'None documented'}
- Medications: ${patient.medications.join('; ') || 'None documented'}

Approved Clinical Facts:
${approvedFacts.map((f) => `- [${f.temporalStatus}] ${f.label}: ${f.value} (Source: ${f.sourceLocation})`).join('\n') || 'None approved'}`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            status: { type: Type.STRING, description: 'MET, NOT_MET, UNKNOWN, or CONFLICTING' },
            patientEvidence: { type: Type.STRING },
            evidenceSourceRef: { type: Type.STRING },
            explanation: { type: Type.STRING },
            confidence: { type: Type.STRING, description: 'HIGH, MODERATE, or LOW' },
            uncertaintyNote: { type: Type.STRING, nullable: true },
          },
          required: ['status', 'patientEvidence', 'evidenceSourceRef', 'explanation', 'confidence'],
        },
      },
    }),
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, any>;
  const validStatus = new Set(['MET', 'NOT_MET', 'UNKNOWN', 'CONFLICTING']);
  return {
    status: validStatus.has(parsed.status) ? parsed.status : 'UNKNOWN',
    evaluationMethod: 'AI_ASSISTED',
    patientEvidence: String(parsed.patientEvidence || 'Evaluated via Gemini pre-screening'),
    evidenceSourceRef: String(parsed.evidenceSourceRef || 'Approved Clinical Record'),
    explanation: String(parsed.explanation || 'AI-assisted pre-screening assessment.'),
    confidence: parsed.confidence || 'MODERATE',
    uncertaintyNote: parsed.uncertaintyNote ? String(parsed.uncertaintyNote) : 'AI-assisted interpretation; human clinical review required.',
    requiresHumanConfirmation: true,
  };
}
