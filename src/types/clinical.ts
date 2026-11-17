export type UserRole = 'RESEARCH_COORDINATOR' | 'CLINICIAN' | 'ADMINISTRATOR';

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  organization: string;
  isDemoUser: boolean;
  consentAcceptedAt: string | null;
  createdAt: string;
}

export interface AuthSession {
  token: string;
  user: UserAccount;
  expiresAt: string;
}

export type TrialDataOrigin = 'PUBLIC_REGISTRY' | 'SITE_VERIFIED' | 'DEMO_SYNTHETIC';

export type CriterionType = 'INCLUSION' | 'EXCLUSION';

export type CriterionCategory =
  | 'AGE'
  | 'DIAGNOSIS'
  | 'DISEASE_STAGE'
  | 'LAB_THRESHOLD'
  | 'PREVIOUS_TREATMENT'
  | 'COMORBIDITY'
  | 'MEDICATION'
  | 'PERFORMANCE_STATUS'
  | 'OTHER';

export type RuleOperator =
  | 'GTE'
  | 'LTE'
  | 'BETWEEN'
  | 'EQUALS'
  | 'INCLUDES'
  | 'EXCLUDES'
  | 'BOOLEAN_PRESENT'
  | 'COMPLEX_HUMAN_REVIEW';

export interface TrialCriterion {
  id: string;
  trialId: string;
  criterionType: CriterionType;
  category: CriterionCategory;
  originalText: string;
  sourceSection: string;
  ruleOperator: RuleOperator;
  targetParameter: string;
  minValue?: number | null;
  maxValue?: number | null;
  unit?: string | null;
  expectedKeywords?: string[];
  requiresHumanReview: boolean;
  reviewNote?: string | null;
  reviewedByUser?: boolean;
}

export interface TrialLocation {
  facility: string;
  city: string;
  state?: string;
  country: string;
  status?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  siteVerified?: boolean;
}

export interface ClinicalTrial {
  id: string;
  nctId: string;
  title: string;
  briefTitle?: string;
  conditions: string[];
  interventions: string[];
  phase: string;
  recruitmentStatus: string;
  sponsor: string;
  summary: string;
  eligibilityCriteriaRaw: string;
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  eligibleSex?: 'ALL' | 'FEMALE' | 'MALE';
  locations: TrialLocation[];
  lastUpdateDate: string;
  dataOrigin: TrialDataOrigin;
  siteVerificationNote?: string;
  structuredCriteria: TrialCriterion[];
  criteriaExtractedAt?: string | null;
  criteriaExtractionSource?: 'GEMINI_AI' | 'SYNTHETIC_DEMO' | 'RULE_PARSER' | null;
}

export type TemporalStatus = 'CURRENT' | 'HISTORICAL' | 'NEGATED' | 'UNCERTAIN';
export type FactReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'EDITED' | 'REJECTED';
export type ConfidenceLevel = 'HIGH' | 'MODERATE' | 'LOW';

export type FactCategory =
  | 'diagnosis'
  | 'disease_stage'
  | 'medication'
  | 'treatment_history'
  | 'lab_value'
  | 'biomarker'
  | 'comorbidity'
  | 'allergy'
  | 'performance_status'
  | 'demographic'
  | 'other';

export interface ExtractedClinicalFact {
  id: string;
  patientId: string;
  category: FactCategory;
  label: string;
  value: string;
  numericValue?: number | null;
  unit?: string | null;
  testDate?: string | null;
  temporalStatus: TemporalStatus;
  confidence: ConfidenceLevel;
  uncertaintyNote?: string | null;
  exactSourceQuote: string;
  sourceLocation: string;
  reviewStatus: FactReviewStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  extractionMethod: 'GEMINI_AI' | 'MANUAL' | 'SYNTHETIC_DEMO';
}

export interface LabResult {
  id: string;
  name: string;
  parameterKey: string;
  value: number;
  unit: string;
  referenceRange?: string;
  testDate: string;
  sourceLocation?: string;
  uncertain?: boolean;
}

export interface PatientProfile {
  id: string;
  mrnLabel: string;
  displayName: string;
  isSynthetic: boolean;
  age: number | null;
  dateOfBirth?: string | null;
  sex: 'FEMALE' | 'MALE' | 'OTHER' | 'UNKNOWN';
  primaryDiagnosis: string;
  diagnosisDate?: string | null;
  diseaseStage: string;
  ecogStatus: number | null;
  medicalHistory: string[];
  medications: string[];
  allergies: string[];
  previousTreatments: string[];
  pathologyInfo: string;
  labResults: LabResult[];
  clinicalNotes: string;
  uploadedDocumentName?: string | null;
  missingOrUncertainFields: string[];
  extractedFacts: ExtractedClinicalFact[];
  aiProcessingAuthorized: boolean;
  updatedAt: string;
  createdAt: string;
}

export type CriterionMatchStatus = 'MET' | 'NOT_MET' | 'UNKNOWN' | 'CONFLICTING';

export type OverallMatchOutcome =
  | 'POTENTIAL_PRE_SCREENING_MATCH'
  | 'REQUIRES_REVIEW'
  | 'INSUFFICIENT_INFORMATION';

export type MatchReviewStatus = 'PENDING_REVIEW' | 'IN_REVIEW' | 'REVIEW_COMPLETE';

export interface CriterionEvaluation {
  id: string;
  criterionId: string;
  criterionType: CriterionType;
  category: CriterionCategory;
  originalCriterionText: string;
  sourceSection: string;
  status: CriterionMatchStatus;
  evaluationMethod: 'DETERMINISTIC_RULE' | 'AI_ASSISTED' | 'CONFLICT_DETECTOR' | 'GAP_DETECTOR';
  patientEvidence: string;
  evidenceSourceRef: string;
  explanation: string;
  confidence: ConfidenceLevel;
  uncertaintyNote?: string | null;
  requiresHumanConfirmation: boolean;
  reviewerOverrideStatus?: CriterionMatchStatus | null;
  reviewerNote?: string | null;
}

export interface MissingInfoItem {
  id: string;
  criterionId: string;
  requiredCategory: CriterionCategory;
  documentationNeeded: string;
  reasonFromCriterion: string;
  currentRecordGap: string;
  clinicalTeamActionNote: string;
}

export interface ReviewerComment {
  id: string;
  authorName: string;
  authorRole: UserRole;
  comment: string;
  createdAt: string;
}

export interface ScreeningMatch {
  id: string;
  patientId: string;
  patientName: string;
  patientMrnLabel: string;
  trialId: string;
  nctId: string;
  trialTitle: string;
  trialCondition: string;
  trialPhase: string;
  recruitmentStatus: string;
  trialLocationSummary: string;
  trialDataOrigin: TrialDataOrigin;
  overallOutcome: OverallMatchOutcome;
  requiresHumanConfirmation: true;
  reviewStatus: MatchReviewStatus;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
  isDemoGenerated: boolean;
  summaryCounts: {
    met: number;
    notMet: number;
    unknown: number;
    conflicting: number;
    total: number;
  };
  evaluations: CriterionEvaluation[];
  missingDocumentation: MissingInfoItem[];
  reviewerComments: ReviewerComment[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  actionType: string;
  entityType: 'AUTH' | 'TRIAL' | 'PATIENT' | 'FACT' | 'MATCH' | 'REPORT' | 'SYSTEM';
  entityId: string;
  summary: string;
  details?: string;
}

export interface WorkspacePolicy {
  aiProcessingEnabled: boolean;
  requireConsentBeforeAi: boolean;
  requireFactReviewBeforeMatch: boolean;
  demoModeActive: boolean;
}

export interface AnalyticsSnapshot {
  isIllustrativeDemo: boolean;
  totals: {
    trialsIndexed: number;
    patientsInWorkspace: number;
    totalMatchesRun: number;
    potentialMatches: number;
    recordsNeedingReview: number;
    missingInfoAlerts: number;
  };
  criterionDistribution: {
    MET: number;
    NOT_MET: number;
    UNKNOWN: number;
    CONFLICTING: number;
  };
  reviewCompletion: {
    PENDING_REVIEW: number;
    IN_REVIEW: number;
    REVIEW_COMPLETE: number;
  };
  missingInfoByCategory: Array<{
    category: string;
    count: number;
  }>;
  searchActivitySeries: Array<{
    label: string;
    trialSearches: number;
    preScreenings: number;
  }>;
}
