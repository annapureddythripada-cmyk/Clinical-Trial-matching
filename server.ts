import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import type {
  ClinicalTrial,
  CriterionMatchStatus,
  ExtractedClinicalFact,
  MatchReviewStatus,
  PatientProfile,
  UserAccount,
  UserRole,
} from './src/types/clinical.ts';
import { db } from './server/db/repository.ts';
import { fetchTrialByNctId, searchClinicalTrialsGov } from './server/services/clinicalTrialsGov.ts';
import {
  evaluateComplexCriterionWithGemini,
  extractPatientFactsWithGemini,
  extractTrialCriteriaWithGemini,
} from './server/services/geminiService.ts';
import {
  computeOverallOutcome,
  computeSummaryCounts,
  runPatientTrialMatch,
} from './server/services/matchingEngine.ts';

interface AuthenticatedRequest extends Request {
  user?: UserAccount;
  authToken?: string;
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = getBearerToken(req);
  const user = db.getUserByToken(token);
  if (!user || !token) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  req.user = user;
  req.authToken = token;
  next();
}

function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied for role ${req.user.role}. Required role: ${roles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '15mb' }));

  // --- Health ---
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
    });
  });

  // --- Module 1: Authentication & Session Management ---
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }
      const result = db.loginWithCredentials(String(email), String(password));
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Sign-in failed.' });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    try {
      const { email, password, fullName, role, organization, consentAccepted } = req.body || {};
      if (!email || !password || !fullName || !role) {
        res.status(400).json({ error: 'Full name, email, password, and role are required.' });
        return;
      }
      if (String(password).length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }
      const allowedRoles: UserRole[] = ['RESEARCH_COORDINATOR', 'CLINICIAN', 'ADMINISTRATOR'];
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid role selected.' });
        return;
      }
      const result = db.registerUser({
        email: String(email),
        password: String(password),
        fullName: String(fullName),
        role,
        organization: String(organization || 'Clinical Research Center'),
        consentAccepted: Boolean(consentAccepted),
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Registration failed.' });
    }
  });

  app.post('/api/auth/demo', (req, res) => {
    try {
      const role: UserRole = req.body?.role || 'RESEARCH_COORDINATOR';
      const allowedRoles: UserRole[] = ['RESEARCH_COORDINATOR', 'CLINICIAN', 'ADMINISTRATOR'];
      if (!allowedRoles.includes(role)) {
        res.status(400).json({ error: 'Invalid demo role.' });
        return;
      }
      const result = db.loginDemoRole(role);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Demo login failed.' });
    }
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    db.logout(getBearerToken(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user, policy: db.getPolicy() });
  });

  // --- Module 12: Dashboard & Analytics ---
  app.get('/api/dashboard/analytics', requireAuth, (_req, res) => {
    res.json(db.getAnalyticsSnapshot());
  });

  // --- Module 2 & 5: Clinical Trial Discovery & Criteria Extraction ---
  app.get('/api/trials', requireAuth, (_req, res) => {
    res.json({ trials: db.listTrials() });
  });

  app.get('/api/trials/search-ctgov', requireAuth, async (req, res) => {
    try {
      const condition = req.query.condition ? String(req.query.condition) : undefined;
      const intervention = req.query.intervention ? String(req.query.intervention) : undefined;
      const location = req.query.location ? String(req.query.location) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const phase = req.query.phase ? String(req.query.phase) : undefined;
      const pageToken = req.query.pageToken ? String(req.query.pageToken) : undefined;

      db.incrementSearchActivity();
      const result = await searchClinicalTrialsGov({
        condition,
        intervention,
        location,
        status,
        phase,
        pageSize: 10,
        pageToken,
      });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({
        error:
          err?.message ||
          'Unable to reach ClinicalTrials.gov public API. You may continue using indexed or synthetic demo trials.',
      });
    }
  });

  app.get('/api/trials/ctgov/:nctId', requireAuth, async (req, res) => {
    try {
      const trial = await fetchTrialByNctId(String(req.params.nctId));
      res.json({ trial });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to look up NCT ID.' });
    }
  });

  app.post('/api/trials/index', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const trial = req.body?.trial as ClinicalTrial | undefined;
      if (!trial || !trial.nctId || !trial.title) {
        res.status(400).json({ error: 'Valid trial object with nctId and title is required.' });
        return;
      }
      const saved = db.upsertTrial(trial, req.user!);
      res.json({ trial: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to index trial.' });
    }
  });

  app.post('/api/trials/:id/verify-site', requireAuth, (req: AuthenticatedRequest, res) => {
    const trial = db.getTrial(String(req.params.id));
    if (!trial) {
      res.status(404).json({ error: 'Trial not found in workspace.' });
      return;
    }
    const locationIndex = Number(req.body?.locationIndex ?? 0);
    const verified = Boolean(req.body?.verified);
    const note = req.body?.note ? String(req.body.note) : undefined;

    const updatedLocations = trial.locations.map((loc, idx) =>
      idx === locationIndex ? { ...loc, siteVerified: verified } : loc,
    );
    const hasVerifiedSite = updatedLocations.some((l) => l.siteVerified);
    const updatedTrial: ClinicalTrial = {
      ...trial,
      locations: updatedLocations,
      dataOrigin:
        trial.dataOrigin === 'DEMO_SYNTHETIC'
          ? 'DEMO_SYNTHETIC'
          : hasVerifiedSite
            ? 'SITE_VERIFIED'
            : 'PUBLIC_REGISTRY',
      siteVerificationNote: note || trial.siteVerificationNote,
    };
    db.upsertTrial(
      updatedTrial,
      req.user!,
      `Updated site verification for ${updatedTrial.nctId} (site #${locationIndex + 1}: ${verified}).`,
    );
    res.json({ trial: updatedTrial });
  });

  app.post('/api/trials/:id/extract-criteria', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const policy = db.getPolicy();
      if (!policy.aiProcessingEnabled) {
        res.status(403).json({
          error: 'AI processing is currently disabled by Workspace Administrator policy.',
        });
        return;
      }

      const trial = db.getTrial(String(req.params.id));
      if (!trial) {
        res.status(404).json({ error: 'Trial not found. Index the trial first.' });
        return;
      }

      const structured = await extractTrialCriteriaWithGemini(trial);
      const updated: ClinicalTrial = {
        ...trial,
        structuredCriteria: structured,
        criteriaExtractedAt: new Date().toISOString(),
        criteriaExtractionSource: 'GEMINI_AI',
      };
      db.upsertTrial(
        updated,
        req.user!,
        `Extracted ${structured.length} structured eligibility criteria for ${updated.nctId} via Gemini.`,
      );
      res.json({ trial: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'AI criteria extraction failed.' });
    }
  });

  app.put('/api/trials/:id/criteria/:criterionId', requireAuth, (req: AuthenticatedRequest, res) => {
    const trial = db.getTrial(String(req.params.id));
    if (!trial) {
      res.status(404).json({ error: 'Trial not found.' });
      return;
    }
    const patch = req.body || {};
    const updatedCriteria = trial.structuredCriteria.map((c) =>
      c.id === req.params.criterionId
        ? {
            ...c,
            category: patch.category ?? c.category,
            ruleOperator: patch.ruleOperator ?? c.ruleOperator,
            targetParameter: patch.targetParameter ?? c.targetParameter,
            minValue: patch.minValue !== undefined ? patch.minValue : c.minValue,
            maxValue: patch.maxValue !== undefined ? patch.maxValue : c.maxValue,
            unit: patch.unit !== undefined ? patch.unit : c.unit,
            expectedKeywords: Array.isArray(patch.expectedKeywords)
              ? patch.expectedKeywords
              : c.expectedKeywords,
            requiresHumanReview:
              patch.requiresHumanReview !== undefined
                ? Boolean(patch.requiresHumanReview)
                : false,
            reviewNote: patch.reviewNote !== undefined ? patch.reviewNote : c.reviewNote,
            reviewedByUser: true,
          }
        : c,
    );
    const updated = { ...trial, structuredCriteria: updatedCriteria };
    db.upsertTrial(
      updated,
      req.user!,
      `Reviewed structured criterion ${req.params.criterionId} on ${trial.nctId}.`,
    );
    res.json({ trial: updated });
  });

  // --- Module 3 & 4: Patient Profile Management & AI Fact Extraction ---
  app.get('/api/patients', requireAuth, (_req, res) => {
    res.json({ patients: db.listPatients() });
  });

  app.post('/api/patients', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const payload = req.body as Partial<PatientProfile>;
      if (!payload.displayName?.trim() || !payload.primaryDiagnosis?.trim()) {
        res.status(400).json({
          error: 'Patient display label and primary diagnosis are required.',
        });
        return;
      }

      const now = new Date().toISOString();
      const existing = payload.id ? db.getPatient(payload.id) : undefined;
      const patient: PatientProfile = {
        id: existing?.id || `patient-${Date.now()}`,
        mrnLabel: payload.mrnLabel?.trim() || existing?.mrnLabel || `SYNTH-PT-${String(Date.now()).slice(-4)}`,
        displayName: payload.displayName.trim(),
        isSynthetic: payload.isSynthetic ?? existing?.isSynthetic ?? true,
        age: payload.age !== undefined && payload.age !== null && String(payload.age) !== '' ? Number(payload.age) : null,
        dateOfBirth: payload.dateOfBirth ?? existing?.dateOfBirth ?? null,
        sex: payload.sex || existing?.sex || 'UNKNOWN',
        primaryDiagnosis: payload.primaryDiagnosis.trim(),
        diagnosisDate: payload.diagnosisDate ?? existing?.diagnosisDate ?? null,
        diseaseStage: payload.diseaseStage?.trim() || 'Unspecified / Under Evaluation',
        ecogStatus:
          payload.ecogStatus !== undefined && payload.ecogStatus !== null && String(payload.ecogStatus) !== ''
            ? Number(payload.ecogStatus)
            : null,
        medicalHistory: Array.isArray(payload.medicalHistory) ? payload.medicalHistory : [],
        medications: Array.isArray(payload.medications) ? payload.medications : [],
        allergies: Array.isArray(payload.allergies) ? payload.allergies : [],
        previousTreatments: Array.isArray(payload.previousTreatments) ? payload.previousTreatments : [],
        pathologyInfo: payload.pathologyInfo || '',
        labResults: Array.isArray(payload.labResults) ? payload.labResults : [],
        clinicalNotes: payload.clinicalNotes || '',
        uploadedDocumentName: payload.uploadedDocumentName ?? existing?.uploadedDocumentName ?? null,
        missingOrUncertainFields: Array.isArray(payload.missingOrUncertainFields)
          ? payload.missingOrUncertainFields
          : [],
        extractedFacts: existing?.extractedFacts || payload.extractedFacts || [],
        aiProcessingAuthorized: Boolean(payload.aiProcessingAuthorized),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };

      const saved = db.upsertPatient(patient, req.user!);
      res.status(existing ? 200 : 201).json({ patient: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save patient profile.' });
    }
  });

  app.delete('/api/patients/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      db.deletePatient(String(req.params.id), req.user!);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Patient not found.' });
    }
  });

  app.post('/api/patients/:id/extract-facts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const policy = db.getPolicy();
      if (!policy.aiProcessingEnabled) {
        res.status(403).json({
          error: 'AI clinical extraction is disabled by Administrator workspace policy.',
        });
        return;
      }

      const patient = db.getPatient(String(req.params.id));
      if (!patient) {
        res.status(404).json({ error: 'Patient profile not found.' });
        return;
      }

      const aiAuthorized = Boolean(req.body?.aiProcessingAuthorized ?? patient.aiProcessingAuthorized);
      if (policy.requireConsentBeforeAi && !aiAuthorized) {
        res.status(403).json({
          error:
            'Explicit AI processing authorization is required before sending clinical notes to Gemini.',
        });
        return;
      }

      const clinicalText = req.body?.clinicalText
        ? String(req.body.clinicalText)
        : [
            patient.clinicalNotes,
            patient.pathologyInfo ? `Pathology: ${patient.pathologyInfo}` : '',
            patient.previousTreatments.length
              ? `Prior Treatments: ${patient.previousTreatments.join(', ')}`
              : '',
            patient.medicalHistory.length
              ? `Medical History: ${patient.medicalHistory.join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n');

      const pdfBase64 = req.body?.pdfBase64 ? String(req.body.pdfBase64) : undefined;
      const documentName = req.body?.documentName
        ? String(req.body.documentName)
        : patient.uploadedDocumentName || 'Clinical Notes';

      if (!clinicalText.trim() && !pdfBase64) {
        res.status(400).json({ error: 'Provide clinical text or upload a PDF/TXT file to extract facts.' });
        return;
      }

      const extracted = await extractPatientFactsWithGemini({
        patientId: patient.id,
        clinicalText: clinicalText.trim() ? clinicalText : undefined,
        pdfBase64,
        documentName,
      });

      const updated: PatientProfile = {
        ...patient,
        aiProcessingAuthorized: true,
        uploadedDocumentName: documentName,
        extractedFacts: [...extracted, ...patient.extractedFacts],
        updatedAt: new Date().toISOString(),
      };
      db.upsertPatient(
        updated,
        req.user!,
        `Extracted ${extracted.length} clinical facts via Gemini for ${patient.mrnLabel} (pending human review).`,
      );
      res.json({ patient: updated, extractedCount: extracted.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'AI fact extraction failed.' });
    }
  });

  app.patch('/api/patients/:id/facts/:factId', requireAuth, (req: AuthenticatedRequest, res) => {
    const patient = db.getPatient(String(req.params.id));
    if (!patient) {
      res.status(404).json({ error: 'Patient profile not found.' });
      return;
    }
    const patch = req.body || {};
    const now = new Date().toISOString();
    const updatedFacts: ExtractedClinicalFact[] = patient.extractedFacts.map((f) => {
      if (f.id !== req.params.factId) return f;
      return {
        ...f,
        label: patch.label ?? f.label,
        value: patch.value ?? f.value,
        temporalStatus: patch.temporalStatus ?? f.temporalStatus,
        numericValue: patch.numericValue !== undefined ? patch.numericValue : f.numericValue,
        unit: patch.unit !== undefined ? patch.unit : f.unit,
        reviewStatus: patch.reviewStatus ?? 'APPROVED',
        reviewedBy: req.user!.fullName,
        reviewedAt: now,
      };
    });

    const updated: PatientProfile = {
      ...patient,
      extractedFacts: updatedFacts,
      updatedAt: now,
    };
    db.upsertPatient(
      updated,
      req.user!,
      `Updated clinical fact review status (${patch.reviewStatus || 'APPROVED'}) on ${patient.mrnLabel}.`,
    );
    res.json({ patient: updated });
  });

  // --- Module 6, 7 & 8: Patient-Trial Matching & Review ---
  app.get('/api/matches', requireAuth, (_req, res) => {
    res.json({ matches: db.listMatches() });
  });

  app.post('/api/matches/evaluate', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { patientId, trialId, useAiAssistance } = req.body || {};
      const patient = db.getPatient(String(patientId));
      const trial = db.getTrial(String(trialId));

      if (!patient || !trial) {
        res.status(404).json({ error: 'Both a valid patient profile and an indexed trial are required.' });
        return;
      }

      const policy = db.getPolicy();
      const pendingFactsCount = patient.extractedFacts.filter(
        (f) => f.reviewStatus === 'PENDING_REVIEW',
      ).length;
      if (policy.requireFactReviewBeforeMatch && pendingFactsCount > 0 && !req.body?.acknowledgePendingFacts) {
        res.status(409).json({
          error: `${pendingFactsCount} extracted clinical fact(s) are still pending human review. Review/approve facts before formal pre-screening, or confirm to proceed with approved facts only.`,
          pendingFactsCount,
        });
        return;
      }

      const match = runPatientTrialMatch(patient, trial, {
        isDemoGenerated: patient.isSynthetic && trial.dataOrigin === 'DEMO_SYNTHETIC',
      });

      // Controlled Gemini AI assistance ONLY for COMPLEX_HUMAN_REVIEW criteria if explicitly requested & authorized
      if (useAiAssistance && policy.aiProcessingEnabled && patient.aiProcessingAuthorized) {
        for (let i = 0; i < match.evaluations.length; i++) {
          const ev = match.evaluations[i];
          const criterion = trial.structuredCriteria.find((c) => c.id === ev.criterionId);
          if (criterion && criterion.ruleOperator === 'COMPLEX_HUMAN_REVIEW') {
            try {
              const aiRes = await evaluateComplexCriterionWithGemini(criterion, patient);
              match.evaluations[i] = {
                ...ev,
                ...aiRes,
              };
            } catch {
              // Preserve deterministic gap-detector fallback if AI evaluation fails
            }
          }
        }
        match.overallOutcome = computeOverallOutcome(match.evaluations);
        match.summaryCounts = computeSummaryCounts(match.evaluations);
      }

      const saved = db.upsertMatch(match, req.user!);
      res.json({ match: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Pre-screening evaluation failed.' });
    }
  });

  app.patch('/api/matches/:id/review', requireAuth, (req: AuthenticatedRequest, res) => {
    const match = db.getMatch(String(req.params.id));
    if (!match) {
      res.status(404).json({ error: 'Match record not found.' });
      return;
    }

    const { criterionId, overrideStatus, reviewerNote, comment, reviewStatus } = req.body || {};
    const now = new Date().toISOString();

    let evaluations = [...match.evaluations];
    if (criterionId) {
      evaluations = evaluations.map((ev) =>
        ev.id === criterionId || ev.criterionId === criterionId
          ? {
              ...ev,
              reviewerOverrideStatus:
                overrideStatus === null ? null : (overrideStatus as CriterionMatchStatus),
              reviewerNote: reviewerNote !== undefined ? String(reviewerNote) : ev.reviewerNote,
            }
          : ev,
      );
    }

    const reviewerComments = [...match.reviewerComments];
    if (comment && String(comment).trim()) {
      reviewerComments.unshift({
        id: `cmt-${Date.now()}`,
        authorName: req.user!.fullName,
        authorRole: req.user!.role,
        comment: String(comment).trim(),
        createdAt: now,
      });
    }

    const nextReviewStatus: MatchReviewStatus = reviewStatus || match.reviewStatus;
    const updated = {
      ...match,
      evaluations,
      reviewerComments,
      overallOutcome: computeOverallOutcome(evaluations),
      summaryCounts: computeSummaryCounts(evaluations),
      reviewStatus: nextReviewStatus,
      reviewedByName: nextReviewStatus === 'REVIEW_COMPLETE' ? req.user!.fullName : match.reviewedByName,
      reviewedAt: nextReviewStatus === 'REVIEW_COMPLETE' ? now : match.reviewedAt,
      updatedAt: now,
    };

    db.upsertMatch(
      updated,
      req.user!,
      `Reviewer update on ${updated.patientMrnLabel} / ${updated.nctId} (Status: ${updated.reviewStatus}).`,
    );
    res.json({ match: updated });
  });

  // --- Module 9: Report Audit ---
  app.post('/api/reports/audit', requireAuth, (req: AuthenticatedRequest, res) => {
    const { matchId, reportType, format } = req.body || {};
    db.addAuditLog({
      actor: req.user!,
      actionType: 'REPORT_GENERATED',
      entityType: 'REPORT',
      entityId: String(matchId || 'unknown'),
      summary: `Generated ${reportType || 'Pre-Screening'} report (${format || 'PREVIEW'}).`,
    });
    res.json({ ok: true });
  });

  // --- Module 10 & 11: Administration, Audit Logs & Demo Data ---
  app.get('/api/admin/audit-logs', requireAuth, (_req, res) => {
    res.json({ logs: db.listAuditLogs() });
  });

  app.get(
    '/api/admin/users',
    requireAuth,
    requireRoles('ADMINISTRATOR'),
    (_req, res) => {
      res.json({ users: db.listUsers() });
    },
  );

  app.patch(
    '/api/admin/users/:id/role',
    requireAuth,
    requireRoles('ADMINISTRATOR'),
    (req: AuthenticatedRequest, res) => {
      try {
        const role = req.body?.role as UserRole;
        const user = db.updateUserRole(String(req.params.id), role, req.user!);
        res.json({ user });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
    },
  );

  app.get('/api/admin/policy', requireAuth, (_req, res) => {
    res.json({ policy: db.getPolicy() });
  });

  app.patch(
    '/api/admin/policy',
    requireAuth,
    requireRoles('ADMINISTRATOR'),
    (req: AuthenticatedRequest, res) => {
      const updated = db.updatePolicy(req.body || {}, req.user!);
      res.json({ policy: updated });
    },
  );

  app.post('/api/admin/demo/load', requireAuth, (req: AuthenticatedRequest, res) => {
    db.loadDemoData(req.user!);
    res.json({ ok: true, policy: db.getPolicy() });
  });

  app.post('/api/admin/demo/run-matching', requireAuth, (req: AuthenticatedRequest, res) => {
    const patients = db.listPatients();
    const trials = db.listTrials();
    if (patients.length === 0 || trials.length === 0) {
      db.loadDemoData(req.user!);
    }
    const currentPatients = db.listPatients().filter((p) => p.isSynthetic);
    const currentTrials = db.listTrials().filter((t) => t.dataOrigin === 'DEMO_SYNTHETIC');

    let evaluatedCount = 0;
    for (const pt of currentPatients) {
      for (const tr of currentTrials) {
        const match = runPatientTrialMatch(pt, tr, { isDemoGenerated: true });
        db.upsertMatch(
          match,
          req.user!,
          `Demo batch matching: ${pt.mrnLabel} × ${tr.nctId} -> ${match.overallOutcome}.`,
        );
        evaluatedCount += 1;
      }
    }
    res.json({ ok: true, evaluatedCount });
  });

  app.post(
    '/api/admin/demo/delete',
    requireAuth,
    requireRoles('ADMINISTRATOR', 'RESEARCH_COORDINATOR', 'CLINICIAN'),
    (req: AuthenticatedRequest, res) => {
      db.deleteDemoData(req.user!);
      res.json({ ok: true, policy: db.getPolicy() });
    },
  );

  // --- Vite / Static SPA Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Clinical Trial Match AI server running at http://localhost:${PORT}`);
  });
}

startServer();
