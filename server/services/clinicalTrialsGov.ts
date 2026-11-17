import type { ClinicalTrial, TrialLocation } from '../../src/types/clinical.ts';
import { parseCriteriaRuleBased } from './matchingEngine.ts';

interface CtGovSearchParams {
  condition?: string;
  intervention?: string;
  location?: string;
  status?: string;
  phase?: string;
  pageSize?: number;
  pageToken?: string;
}

function parseAgeYears(ageStr?: string): number | null {
  if (!ageStr) return null;
  const match = ageStr.match(/(\d+)\s*Year/i);
  return match ? Number(match[1]) : null;
}

function mapSex(sex?: string): 'ALL' | 'FEMALE' | 'MALE' {
  if (sex === 'FEMALE') return 'FEMALE';
  if (sex === 'MALE') return 'MALE';
  return 'ALL';
}

function transformStudy(study: Record<string, any>): ClinicalTrial {
  const p = study.protocolSection || {};
  const idMod = p.identificationModule || {};
  const statusMod = p.statusModule || {};
  const sponsorMod = p.sponsorCollaboratorsModule || {};
  const descMod = p.descriptionModule || {};
  const condMod = p.conditionsModule || {};
  const designMod = p.designModule || {};
  const armsMod = p.armsInterventionsModule || {};
  const eligMod = p.eligibilityModule || {};
  const locMod = p.contactsLocationsModule || {};

  const nctId = idMod.nctId || 'NCT-UNKNOWN';
  const phases: string[] = Array.isArray(designMod.phases) ? designMod.phases : [];
  const interventions: string[] = Array.isArray(armsMod.interventions)
    ? armsMod.interventions.map((i: any) => i.name).filter(Boolean)
    : [];

  const locations: TrialLocation[] = Array.isArray(locMod.locations)
    ? locMod.locations.slice(0, 12).map((l: any) => ({
        facility: l.facility || 'Clinical Study Site',
        city: l.city || 'Unspecified City',
        state: l.state || undefined,
        country: l.country || 'Unspecified Country',
        status: l.status || undefined,
        contactName: l.contacts?.[0]?.name || locMod.centralContacts?.[0]?.name || undefined,
        contactPhone: l.contacts?.[0]?.phone || locMod.centralContacts?.[0]?.phone || undefined,
        contactEmail: l.contacts?.[0]?.email || locMod.centralContacts?.[0]?.email || undefined,
        siteVerified: false,
      }))
    : [];

  const trial: ClinicalTrial = {
    id: `ctgov-${nctId}`,
    nctId,
    title: idMod.officialTitle || idMod.briefTitle || 'Untitled Clinical Trial',
    briefTitle: idMod.briefTitle || undefined,
    conditions: Array.isArray(condMod.conditions) ? condMod.conditions : [],
    interventions,
    phase: phases.length > 0 ? phases.join(' / ') : 'NOT_APPLICABLE',
    recruitmentStatus: statusMod.overallStatus || 'UNKNOWN',
    sponsor: sponsorMod.leadSponsor?.name || 'Sponsor not listed',
    summary: descMod.briefSummary || 'No brief summary provided in ClinicalTrials.gov registry.',
    eligibilityCriteriaRaw:
      eligMod.eligibilityCriteria || 'Eligibility criteria text unavailable in registry record.',
    minAgeYears: parseAgeYears(eligMod.minimumAge),
    maxAgeYears: parseAgeYears(eligMod.maximumAge),
    eligibleSex: mapSex(eligMod.sex),
    locations,
    lastUpdateDate:
      statusMod.lastUpdatePostDateStruct?.date ||
      statusMod.studyFirstPostDateStruct?.date ||
      'Unavailable',
    dataOrigin: 'PUBLIC_REGISTRY',
    siteVerificationNote:
      'Public ClinicalTrials.gov v2 registry data. Local hospital participation, active slot capacity, and site PI contacts are not locally verified.',
    structuredCriteria: [],
    criteriaExtractedAt: null,
    criteriaExtractionSource: null,
  };

  trial.structuredCriteria = parseCriteriaRuleBased(trial);
  return trial;
}

export async function searchClinicalTrialsGov(params: CtGovSearchParams): Promise<{
  trials: ClinicalTrial[];
  totalCount: number;
  nextPageToken?: string;
}> {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(Math.min(Math.max(params.pageSize || 12, 1), 25)));
  url.searchParams.set('countTotal', 'true');

  if (params.condition?.trim()) {
    url.searchParams.set('query.cond', params.condition.trim());
  }
  if (params.intervention?.trim()) {
    url.searchParams.set('query.intr', params.intervention.trim());
  }
  if (params.location?.trim()) {
    url.searchParams.set('query.locn', params.location.trim());
  }
  if (params.status?.trim() && params.status !== 'ALL') {
    url.searchParams.set('filter.overallStatus', params.status.trim());
  }
  if (params.phase?.trim() && params.phase !== 'ALL') {
    url.searchParams.set('query.term', `AREA[Phase]${params.phase.trim()}`);
  }
  if (params.pageToken?.trim()) {
    url.searchParams.set('pageToken', params.pageToken.trim());
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov API responded with HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      studies?: Record<string, any>[];
      totalCount?: number;
      nextPageToken?: string;
    };

    const studies = Array.isArray(data.studies) ? data.studies : [];
    return {
      trials: studies.map(transformStudy),
      totalCount: typeof data.totalCount === 'number' ? data.totalCount : studies.length,
      nextPageToken: data.nextPageToken,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTrialByNctId(nctId: string): Promise<ClinicalTrial> {
  const sanitized = nctId.trim().toUpperCase();
  if (!/^NCT\d{6,10}$/.test(sanitized)) {
    throw new Error('Invalid NCT identifier format. Expected format like NCT05841290.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://clinicaltrials.gov/api/v2/studies/${encodeURIComponent(sanitized)}?format=json`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`ClinicalTrials.gov lookup failed (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as Record<string, any>;
    return transformStudy(data);
  } finally {
    clearTimeout(timeout);
  }
}
