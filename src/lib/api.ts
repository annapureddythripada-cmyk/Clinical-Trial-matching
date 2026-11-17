import type {
  AnalyticsSnapshot,
  AuditLogEntry,
  AuthSession,
  ClinicalTrial,
  CriterionMatchStatus,
  MatchReviewStatus,
  PatientProfile,
  ScreeningMatch,
  TrialCriterion,
  UserAccount,
  UserRole,
  WorkspacePolicy,
} from '../types/clinical';

const TOKEN_STORAGE_KEY = 'ctm_ai_session_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    apiRequest<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    organization: string;
    consentAccepted: boolean;
  }) =>
    apiRequest<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  demoLogin: (role: UserRole) =>
    apiRequest<AuthSession>('/api/auth/demo', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  logout: () =>
    apiRequest<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () =>
    apiRequest<{ user: UserAccount; policy: WorkspacePolicy }>('/api/auth/me'),

  // Dashboard & Analytics
  getAnalytics: () => apiRequest<AnalyticsSnapshot>('/api/dashboard/analytics'),

  // Trials
  listTrials: () => apiRequest<{ trials: ClinicalTrial[] }>('/api/trials'),

  searchCtGov: (params: {
    condition?: string;
    intervention?: string;
    location?: string;
    status?: string;
    phase?: string;
    pageToken?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.condition) qs.set('condition', params.condition);
    if (params.intervention) qs.set('intervention', params.intervention);
    if (params.location) qs.set('location', params.location);
    if (params.status) qs.set('status', params.status);
    if (params.phase) qs.set('phase', params.phase);
    if (params.pageToken) qs.set('pageToken', params.pageToken);
    return apiRequest<{ trials: ClinicalTrial[]; totalCount: number; nextPageToken?: string }>(
      `/api/trials/search-ctgov?${qs.toString()}`,
    );
  },

  lookupNct: (nctId: string) =>
    apiRequest<{ trial: ClinicalTrial }>(`/api/trials/ctgov/${encodeURIComponent(nctId)}`),

  indexTrial: (trial: ClinicalTrial) =>
    apiRequest<{ trial: ClinicalTrial }>('/api/trials/index', {
      method: 'POST',
      body: JSON.stringify({ trial }),
    }),

  verifySite: (trialId: string, locationIndex: number, verified: boolean, note?: string) =>
    apiRequest<{ trial: ClinicalTrial }>(`/api/trials/${encodeURIComponent(trialId)}/verify-site`, {
      method: 'POST',
      body: JSON.stringify({ locationIndex, verified, note }),
    }),

  extractTrialCriteria: (trialId: string) =>
    apiRequest<{ trial: ClinicalTrial }>(
      `/api/trials/${encodeURIComponent(trialId)}/extract-criteria`,
      { method: 'POST' },
    ),

  updateCriterion: (trialId: string, criterionId: string, patch: Partial<TrialCriterion>) =>
    apiRequest<{ trial: ClinicalTrial }>(
      `/api/trials/${encodeURIComponent(trialId)}/criteria/${encodeURIComponent(criterionId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      },
    ),

  // Patients
  listPatients: () => apiRequest<{ patients: PatientProfile[] }>('/api/patients'),

  savePatient: (patient: Partial<PatientProfile>) =>
    apiRequest<{ patient: PatientProfile }>('/api/patients', {
      method: 'POST',
      body: JSON.stringify(patient),
    }),

  deletePatient: (patientId: string) =>
    apiRequest<{ ok: boolean }>(`/api/patients/${encodeURIComponent(patientId)}`, {
      method: 'DELETE',
    }),

  extractPatientFacts: (
    patientId: string,
    payload: {
      clinicalText?: string;
      pdfBase64?: string;
      documentName?: string;
      aiProcessingAuthorized: boolean;
    },
  ) =>
    apiRequest<{ patient: PatientProfile; extractedCount: number }>(
      `/api/patients/${encodeURIComponent(patientId)}/extract-facts`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  reviewPatientFact: (
    patientId: string,
    factId: string,
    patch: {
      reviewStatus: 'APPROVED' | 'EDITED' | 'REJECTED';
      label?: string;
      value?: string;
      temporalStatus?: 'CURRENT' | 'HISTORICAL' | 'NEGATED' | 'UNCERTAIN';
      numericValue?: number | null;
      unit?: string | null;
    },
  ) =>
    apiRequest<{ patient: PatientProfile }>(
      `/api/patients/${encodeURIComponent(patientId)}/facts/${encodeURIComponent(factId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
    ),

  // Matching & Review
  listMatches: () => apiRequest<{ matches: ScreeningMatch[] }>('/api/matches'),

  evaluateMatch: (payload: {
    patientId: string;
    trialId: string;
    useAiAssistance?: boolean;
    acknowledgePendingFacts?: boolean;
  }) =>
    apiRequest<{ match: ScreeningMatch }>('/api/matches/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reviewMatch: (
    matchId: string,
    payload: {
      criterionId?: string;
      overrideStatus?: CriterionMatchStatus | null;
      reviewerNote?: string;
      comment?: string;
      reviewStatus?: MatchReviewStatus;
    },
  ) =>
    apiRequest<{ match: ScreeningMatch }>(`/api/matches/${encodeURIComponent(matchId)}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  auditReport: (matchId: string, reportType: string, format: string) =>
    apiRequest<{ ok: boolean }>('/api/reports/audit', {
      method: 'POST',
      body: JSON.stringify({ matchId, reportType, format }),
    }),

  // Admin & Governance
  listAuditLogs: () => apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs'),
  listUsers: () => apiRequest<{ users: UserAccount[] }>('/api/admin/users'),
  updateUserRole: (userId: string, role: UserRole) =>
    apiRequest<{ user: UserAccount }>(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  getPolicy: () => apiRequest<{ policy: WorkspacePolicy }>('/api/admin/policy'),
  updatePolicy: (patch: Partial<WorkspacePolicy>) =>
    apiRequest<{ policy: WorkspacePolicy }>('/api/admin/policy', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  loadDemoData: () => apiRequest<{ ok: boolean; policy: WorkspacePolicy }>('/api/admin/demo/load', { method: 'POST' }),
  runDemoMatching: () => apiRequest<{ ok: boolean; evaluatedCount: number }>('/api/admin/demo/run-matching', { method: 'POST' }),
  deleteDemoData: () => apiRequest<{ ok: boolean; policy: WorkspacePolicy }>('/api/admin/demo/delete', { method: 'POST' }),
};
