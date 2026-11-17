import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AnalyticsSnapshot,
  AuditLogEntry,
  ClinicalTrial,
  PatientProfile,
  ScreeningMatch,
  UserAccount,
  UserRole,
  WorkspacePolicy,
} from '../../src/types/clinical.ts';
import { DEMO_PATIENTS, DEMO_TRIALS } from '../data/demoSeed.ts';
import { runPatientTrialMatch } from '../services/matchingEngine.ts';

interface StoredUser extends UserAccount {
  passwordHash: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: string;
}

interface DatabaseState {
  users: StoredUser[];
  sessions: StoredSession[];
  trials: ClinicalTrial[];
  patients: PatientProfile[];
  matches: ScreeningMatch[];
  auditLogs: AuditLogEntry[];
  policy: WorkspacePolicy;
  searchActivityCount: number;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'clinical_match_db.json');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(12).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

function buildInitialDemoUsers(): StoredUser[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'user-demo-coord',
      email: 'coordinator@clinicalmatch.demo',
      passwordHash: hashPassword('DemoCoordinator2026!'),
      fullName: 'Sarah J. Evans, CCRP',
      role: 'RESEARCH_COORDINATOR',
      organization: 'Pacific Clinical Research Network (Demo)',
      isDemoUser: true,
      consentAcceptedAt: now,
      createdAt: now,
    },
    {
      id: 'user-demo-clinician',
      email: 'clinician@clinicalmatch.demo',
      passwordHash: hashPassword('DemoClinician2026!'),
      fullName: 'Dr. Aris Thorne, MD',
      role: 'CLINICIAN',
      organization: 'Pacific Clinical Research Network (Demo)',
      isDemoUser: true,
      consentAcceptedAt: now,
      createdAt: now,
    },
    {
      id: 'user-demo-admin',
      email: 'admin@clinicalmatch.demo',
      passwordHash: hashPassword('DemoAdmin2026!'),
      fullName: 'Maya Lin, MS (Workspace Admin)',
      role: 'ADMINISTRATOR',
      organization: 'Pacific Clinical Research Network (Demo)',
      isDemoUser: true,
      consentAcceptedAt: now,
      createdAt: now,
    },
  ];
}

function buildDemoMatches(): ScreeningMatch[] {
  const pt1 = DEMO_PATIENTS[0]; // Elena Rostova (NSCLC EGFR+)
  const pt2 = DEMO_PATIENTS[1]; // Marcus Vance (KRAS G12C CRC, low platelets + recent MI)
  const pt3 = DEMO_PATIENTS[2]; // Priya Nair (TNBC, missing labs/PD-L1/LVEF)
  const pt4 = DEMO_PATIENTS[3]; // David Thorne (Melanoma, conflicting ECOG & Brain MRI)

  const tr1 = DEMO_TRIALS[0]; // NCT05841290 - First-line EGFR+ NSCLC
  const tr2 = DEMO_TRIALS[1]; // NCT06019450 - Post-Osimertinib NSCLC
  const tr3 = DEMO_TRIALS[2]; // NCT05910322 - KRAS G12C Colorectal
  const tr4 = DEMO_TRIALS[3]; // NCT05728814 - TNBC
  const tr5 = DEMO_TRIALS[4]; // NCT06104588 - BRAF V600E Melanoma

  const m1 = runPatientTrialMatch(pt1, tr1, { isDemoGenerated: true, existingMatchId: 'match-demo-001' });
  m1.reviewStatus = 'IN_REVIEW';
  m1.reviewerComments = [
    {
      id: 'cmt-demo-1',
      authorName: 'Sarah J. Evans, CCRP',
      authorRole: 'RESEARCH_COORDINATOR',
      comment:
        'All baseline hematology, renal, and EGFR Exon 19 deletion criteria satisfied in synthetic chart. Pending Principal Investigator confirmation.',
      createdAt: '2026-11-12T15:10:00Z',
    },
  ];

  const m2 = runPatientTrialMatch(pt1, tr2, { isDemoGenerated: true, existingMatchId: 'match-demo-002' });
  m2.reviewStatus = 'REVIEW_COMPLETE';
  m2.reviewedByName = 'Dr. Aris Thorne, MD';
  m2.reviewedAt = '2026-11-12T16:00:00Z';

  const m3 = runPatientTrialMatch(pt2, tr3, { isDemoGenerated: true, existingMatchId: 'match-demo-003' });
  m3.reviewStatus = 'PENDING_REVIEW';

  const m4 = runPatientTrialMatch(pt3, tr4, { isDemoGenerated: true, existingMatchId: 'match-demo-004' });
  m4.reviewStatus = 'PENDING_REVIEW';

  const m5 = runPatientTrialMatch(pt4, tr5, { isDemoGenerated: true, existingMatchId: 'match-demo-005' });
  m5.reviewStatus = 'PENDING_REVIEW';

  return [m1, m2, m3, m4, m5];
}

function createSeededState(): DatabaseState {
  const now = new Date().toISOString();
  return {
    users: buildInitialDemoUsers(),
    sessions: [],
    trials: structuredClone(DEMO_TRIALS),
    patients: structuredClone(DEMO_PATIENTS),
    matches: buildDemoMatches(),
    auditLogs: [
      {
        id: 'audit-seed-1',
        timestamp: now,
        actorId: 'system',
        actorName: 'System Seed',
        actorRole: 'ADMINISTRATOR',
        actionType: 'LOAD_DEMO_DATA',
        entityType: 'SYSTEM',
        entityId: 'demo-workspace',
        summary: 'Initialized synthetic demonstration workspace with 5 trials and 4 synthetic patient profiles.',
      },
    ],
    policy: {
      aiProcessingEnabled: true,
      requireConsentBeforeAi: true,
      requireFactReviewBeforeMatch: true,
      demoModeActive: true,
    },
    searchActivityCount: 14,
  };
}

class ClinicalDatabaseRepository {
  private state: DatabaseState;

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (parsed && Array.isArray(parsed.users) && Array.isArray(parsed.trials)) {
          return parsed;
        }
      }
    } catch {
      // Fall back to fresh seeded state if file is unreadable
    }
    const seeded = createSeededState();
    this.saveToDisk(seeded);
    return seeded;
  }

  private saveToDisk(nextState: DatabaseState = this.state): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(nextState, null, 2), 'utf-8');
  }

  private sanitizeUser(u: StoredUser): UserAccount {
    const { passwordHash: _ignored, ...safe } = u;
    return safe;
  }

  // --- Auth & Sessions ---
  registerUser(params: {
    email: string;
    password: string;
    fullName: string;
    role: UserRole;
    organization: string;
    consentAccepted: boolean;
  }): { user: UserAccount; token: string } {
    const normalizedEmail = params.email.trim().toLowerCase();
    if (this.state.users.some((u) => u.email === normalizedEmail)) {
      throw new Error('An account with this email already exists.');
    }
    if (!params.consentAccepted) {
      throw new Error('You must acknowledge the Data-Use & Clinical Boundary Notice to create an account.');
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
      id: `user-${crypto.randomUUID().slice(0, 8)}`,
      email: normalizedEmail,
      passwordHash: hashPassword(params.password),
      fullName: params.fullName.trim(),
      role: params.role,
      organization: params.organization.trim() || 'Clinical Research Site',
      isDemoUser: false,
      consentAcceptedAt: now,
      createdAt: now,
    };

    this.state.users.push(newUser);
    const token = this.createSession(newUser.id);
    this.addAuditLog({
      actor: this.sanitizeUser(newUser),
      actionType: 'USER_REGISTERED',
      entityType: 'AUTH',
      entityId: newUser.id,
      summary: `Registered ${newUser.role} account (${newUser.email}).`,
    });
    this.saveToDisk();
    return { user: this.sanitizeUser(newUser), token };
  }

  loginWithCredentials(email: string, password: string): { user: UserAccount; token: string } {
    const normalized = email.trim().toLowerCase();
    const user = this.state.users.find((u) => u.email === normalized);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid email or password.');
    }
    const token = this.createSession(user.id);
    this.addAuditLog({
      actor: this.sanitizeUser(user),
      actionType: 'USER_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      summary: `Signed in as ${user.role}.`,
    });
    this.saveToDisk();
    return { user: this.sanitizeUser(user), token };
  }

  loginDemoRole(role: UserRole): { user: UserAccount; token: string } {
    let user = this.state.users.find((u) => u.isDemoUser && u.role === role);
    if (!user) {
      const defaults = buildInitialDemoUsers();
      user = defaults.find((u) => u.role === role)!;
      this.state.users.push(user);
    }
    const token = this.createSession(user.id);
    this.addAuditLog({
      actor: this.sanitizeUser(user),
      actionType: 'DEMO_LOGIN',
      entityType: 'AUTH',
      entityId: user.id,
      summary: `Started safe demo session as ${role}.`,
    });
    this.saveToDisk();
    return { user: this.sanitizeUser(user), token };
  }

  private createSession(userId: string): string {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    this.state.sessions = this.state.sessions.filter(
      (s) => Date.parse(s.expiresAt) > Date.now(),
    );
    this.state.sessions.push({ token, userId, expiresAt });
    return token;
  }

  getUserByToken(token?: string | null): UserAccount | null {
    if (!token) return null;
    const session = this.state.sessions.find(
      (s) => s.token === token && Date.parse(s.expiresAt) > Date.now(),
    );
    if (!session) return null;
    const user = this.state.users.find((u) => u.id === session.userId);
    return user ? this.sanitizeUser(user) : null;
  }

  logout(token?: string | null): void {
    if (!token) return;
    this.state.sessions = this.state.sessions.filter((s) => s.token !== token);
    this.saveToDisk();
  }

  listUsers(): UserAccount[] {
    return this.state.users.map((u) => this.sanitizeUser(u));
  }

  updateUserRole(userId: string, role: UserRole, actor: UserAccount): UserAccount {
    const user = this.state.users.find((u) => u.id === userId);
    if (!user) throw new Error('User account not found.');
    const previousRole = user.role;
    user.role = role;
    this.addAuditLog({
      actor,
      actionType: 'ROLE_UPDATED',
      entityType: 'AUTH',
      entityId: user.id,
      summary: `Updated role for ${user.fullName} from ${previousRole} to ${role}.`,
    });
    this.saveToDisk();
    return this.sanitizeUser(user);
  }

  // --- Policy & Demo Management ---
  getPolicy(): WorkspacePolicy {
    return this.state.policy;
  }

  updatePolicy(patch: Partial<WorkspacePolicy>, actor: UserAccount): WorkspacePolicy {
    this.state.policy = { ...this.state.policy, ...patch };
    this.addAuditLog({
      actor,
      actionType: 'POLICY_UPDATED',
      entityType: 'SYSTEM',
      entityId: 'workspace-policy',
      summary: `Updated workspace governance policy.`,
      details: JSON.stringify(patch),
    });
    this.saveToDisk();
    return this.state.policy;
  }

  loadDemoData(actor: UserAccount): void {
    const existingNonDemoTrials = this.state.trials.filter((t) => t.dataOrigin !== 'DEMO_SYNTHETIC');
    const existingNonDemoPatients = this.state.patients.filter((p) => !p.isSynthetic);

    this.state.trials = [...structuredClone(DEMO_TRIALS), ...existingNonDemoTrials];
    this.state.patients = [...structuredClone(DEMO_PATIENTS), ...existingNonDemoPatients];

    const nonDemoMatches = this.state.matches.filter((m) => !m.isDemoGenerated);
    this.state.matches = [...buildDemoMatches(), ...nonDemoMatches];
    this.state.policy.demoModeActive = true;

    this.addAuditLog({
      actor,
      actionType: 'LOAD_DEMO_DATA',
      entityType: 'SYSTEM',
      entityId: 'demo-workspace',
      summary: 'Loaded 5 synthetic clinical trials, 4 synthetic patient profiles, and illustrative pre-screening matches.',
    });
    this.saveToDisk();
  }

  deleteDemoData(actor: UserAccount): void {
    this.state.trials = this.state.trials.filter((t) => t.dataOrigin !== 'DEMO_SYNTHETIC');
    this.state.patients = this.state.patients.filter((p) => !p.isSynthetic);
    this.state.matches = this.state.matches.filter((m) => !m.isDemoGenerated);
    this.state.policy.demoModeActive = false;

    this.addAuditLog({
      actor,
      actionType: 'DELETE_DEMO_DATA',
      entityType: 'SYSTEM',
      entityId: 'demo-workspace',
      summary: 'Removed all synthetic demo trials, patients, and demo pre-screening matches.',
    });
    this.saveToDisk();
  }

  // --- Trials ---
  listTrials(): ClinicalTrial[] {
    return this.state.trials;
  }

  getTrial(id: string): ClinicalTrial | undefined {
    return this.state.trials.find((t) => t.id === id || t.nctId === id);
  }

  upsertTrial(trial: ClinicalTrial, actor: UserAccount, actionSummary?: string): ClinicalTrial {
    const idx = this.state.trials.findIndex((t) => t.id === trial.id || t.nctId === trial.nctId);
    if (idx >= 0) {
      this.state.trials[idx] = trial;
    } else {
      this.state.trials.unshift(trial);
    }
    this.addAuditLog({
      actor,
      actionType: 'TRIAL_SAVED',
      entityType: 'TRIAL',
      entityId: trial.nctId,
      summary: actionSummary || `Indexed trial ${trial.nctId} (${trial.dataOrigin}).`,
    });
    this.saveToDisk();
    return trial;
  }

  incrementSearchActivity(): void {
    this.state.searchActivityCount += 1;
    this.saveToDisk();
  }

  // --- Patients ---
  listPatients(): PatientProfile[] {
    return this.state.patients;
  }

  getPatient(id: string): PatientProfile | undefined {
    return this.state.patients.find((p) => p.id === id);
  }

  upsertPatient(patient: PatientProfile, actor: UserAccount, summary?: string): PatientProfile {
    const idx = this.state.patients.findIndex((p) => p.id === patient.id);
    if (idx >= 0) {
      this.state.patients[idx] = patient;
    } else {
      this.state.patients.unshift(patient);
    }
    this.addAuditLog({
      actor,
      actionType: idx >= 0 ? 'PATIENT_UPDATED' : 'PATIENT_CREATED',
      entityType: 'PATIENT',
      entityId: patient.id,
      summary: summary || `Saved patient profile ${patient.mrnLabel} (${patient.displayName}).`,
    });
    this.saveToDisk();
    return patient;
  }

  deletePatient(patientId: string, actor: UserAccount): void {
    const pt = this.getPatient(patientId);
    if (!pt) throw new Error('Patient profile not found.');
    this.state.patients = this.state.patients.filter((p) => p.id !== patientId);
    this.state.matches = this.state.matches.filter((m) => m.patientId !== patientId);
    this.addAuditLog({
      actor,
      actionType: 'PATIENT_DELETED',
      entityType: 'PATIENT',
      entityId: patientId,
      summary: `Deleted patient profile ${pt.mrnLabel} and associated pre-screening records.`,
    });
    this.saveToDisk();
  }

  // --- Matches ---
  listMatches(): ScreeningMatch[] {
    return this.state.matches;
  }

  getMatch(id: string): ScreeningMatch | undefined {
    return this.state.matches.find((m) => m.id === id);
  }

  upsertMatch(match: ScreeningMatch, actor: UserAccount, summary?: string): ScreeningMatch {
    const idx = this.state.matches.findIndex((m) => m.id === match.id);
    if (idx >= 0) {
      this.state.matches[idx] = match;
    } else {
      this.state.matches.unshift(match);
    }
    this.addAuditLog({
      actor,
      actionType: 'MATCH_EVALUATED',
      entityType: 'MATCH',
      entityId: match.id,
      summary:
        summary ||
        `Pre-screened ${match.patientMrnLabel} against ${match.nctId}: ${match.overallOutcome}.`,
    });
    this.saveToDisk();
    return match;
  }

  // --- Audit & Analytics ---
  addAuditLog(entry: {
    actor: Pick<UserAccount, 'id' | 'fullName' | 'role'>;
    actionType: string;
    entityType: AuditLogEntry['entityType'];
    entityId: string;
    summary: string;
    details?: string;
  }): AuditLogEntry {
    const record: AuditLogEntry = {
      id: `audit-${crypto.randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      actorId: entry.actor.id,
      actorName: entry.actor.fullName,
      actorRole: entry.actor.role,
      actionType: entry.actionType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      details: entry.details,
    };
    this.state.auditLogs.unshift(record);
    if (this.state.auditLogs.length > 250) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 250);
    }
    this.saveToDisk();
    return record;
  }

  listAuditLogs(): AuditLogEntry[] {
    return this.state.auditLogs;
  }

  getAnalyticsSnapshot(): AnalyticsSnapshot {
    const trials = this.state.trials;
    const patients = this.state.patients;
    const matches = this.state.matches;

    const criterionDistribution = {
      MET: 0,
      NOT_MET: 0,
      UNKNOWN: 0,
      CONFLICTING: 0,
    };
    const reviewCompletion = {
      PENDING_REVIEW: 0,
      IN_REVIEW: 0,
      REVIEW_COMPLETE: 0,
    };
    const missingMap: Record<string, number> = {};

    for (const m of matches) {
      reviewCompletion[m.reviewStatus] += 1;
      for (const ev of m.evaluations) {
        const st = ev.reviewerOverrideStatus ?? ev.status;
        criterionDistribution[st] += 1;
      }
      for (const miss of m.missingDocumentation) {
        missingMap[miss.requiredCategory] = (missingMap[miss.requiredCategory] || 0) + 1;
      }
    }

    const potentialMatches = matches.filter(
      (m) => m.overallOutcome === 'POTENTIAL_PRE_SCREENING_MATCH',
    ).length;
    const recordsNeedingReview = matches.filter((m) => m.reviewStatus !== 'REVIEW_COMPLETE').length;
    const missingInfoAlerts = matches.reduce(
      (acc, m) => acc + m.missingDocumentation.length,
      0,
    );

    return {
      isIllustrativeDemo: this.state.policy.demoModeActive || matches.some((m) => m.isDemoGenerated),
      totals: {
        trialsIndexed: trials.length,
        patientsInWorkspace: patients.length,
        totalMatchesRun: matches.length,
        potentialMatches,
        recordsNeedingReview,
        missingInfoAlerts,
      },
      criterionDistribution,
      reviewCompletion,
      missingInfoByCategory: Object.entries(missingMap).map(([category, count]) => ({
        category,
        count,
      })),
      searchActivitySeries: [
        { label: 'Day -4', trialSearches: 3, preScreenings: 1 },
        { label: 'Day -3', trialSearches: 5, preScreenings: 2 },
        { label: 'Day -2', trialSearches: 4, preScreenings: 2 },
        { label: 'Yesterday', trialSearches: 6, preScreenings: 3 },
        {
          label: 'Today',
          trialSearches: Math.max(2, this.state.searchActivityCount - 10),
          preScreenings: Math.max(1, matches.length - 3),
        },
      ],
    };
  }
}

export const db = new ClinicalDatabaseRepository();
