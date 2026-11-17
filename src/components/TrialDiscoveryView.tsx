import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  BookmarkPlus,
  Building2,
  Check,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Search,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import type { ClinicalTrial, TrialCriterion } from '../types/clinical';
import { DataOriginTag } from './StatusBadge';

interface TrialDiscoveryViewProps {
  indexedTrials: ClinicalTrial[];
  onTrialsUpdated: () => Promise<void>;
  onNavigateToMatching: (trialId: string) => void;
}

export function TrialDiscoveryView({
  indexedTrials,
  onTrialsUpdated,
  onNavigateToMatching,
}: TrialDiscoveryViewProps) {
  const [sourceTab, setSourceTab] = useState<'indexed' | 'ctgov'>('indexed');
  const [condition, setCondition] = useState('Non-Small Cell Lung Cancer');
  const [intervention, setIntervention] = useState('');
  const [location, setLocation] = useState('');
  const [statusFilter, setStatusFilter] = useState('RECRUITING');
  const [phaseFilter, setPhaseFilter] = useState('ALL');
  const [nctLookup, setNctLookup] = useState('');

  const [ctgovResults, setCtgovResults] = useState<ClinicalTrial[]>([]);
  const [ctgovTotal, setCtgovTotal] = useState<number>(0);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearchedLive, setHasSearchedLive] = useState(false);

  const [indexedFilter, setIndexedFilter] = useState('');
  const [selectedTrial, setSelectedTrial] = useState<ClinicalTrial | null>(
    indexedTrials[0] || null,
  );
  const [extractingCriteria, setExtractingCriteria] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<TrialCriterion>>({});

  async function handleLiveSearch(e: FormEvent, appendPageToken?: string) {
    e.preventDefault();
    setSearching(true);
    setSearchError(null);
    setHasSearchedLive(true);
    setSourceTab('ctgov');
    try {
      const res = await api.searchCtGov({
        condition,
        intervention,
        location,
        status: statusFilter,
        phase: phaseFilter,
        pageToken: appendPageToken,
      });
      setCtgovResults((prev) => (appendPageToken ? [...prev, ...res.trials] : res.trials));
      setCtgovTotal(res.totalCount);
      setNextPageToken(res.nextPageToken);
      if (!appendPageToken && res.trials.length > 0) {
        setSelectedTrial(res.trials[0]);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Unable to query ClinicalTrials.gov API.');
    } finally {
      setSearching(false);
    }
  }

  async function handleNctLookup() {
    if (!nctLookup.trim()) return;
    setSearching(true);
    setSearchError(null);
    setHasSearchedLive(true);
    setSourceTab('ctgov');
    try {
      const res = await api.lookupNct(nctLookup.trim());
      setCtgovResults([res.trial]);
      setCtgovTotal(1);
      setSelectedTrial(res.trial);
    } catch (err: any) {
      setSearchError(err.message || 'NCT lookup failed.');
    } finally {
      setSearching(false);
    }
  }

  async function handleIndexTrial(trial: ClinicalTrial) {
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await api.indexTrial(trial);
      await onTrialsUpdated();
      setSelectedTrial(res.trial);
      setActionMessage(`Indexed ${res.trial.nctId} into workspace for pre-screening.`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to index trial.');
    }
  }

  async function handleExtractCriteria(trial: ClinicalTrial) {
    setExtractingCriteria(true);
    setActionError(null);
    setActionMessage(null);
    try {
      // Ensure trial is indexed first if it came straight from live search
      const isIndexed = indexedTrials.some((t) => t.nctId === trial.nctId);
      let targetId = trial.id;
      if (!isIndexed) {
        const indexedRes = await api.indexTrial(trial);
        targetId = indexedRes.trial.id;
      }
      const res = await api.extractTrialCriteria(targetId);
      await onTrialsUpdated();
      setSelectedTrial(res.trial);
      setActionMessage(
        `Extracted ${res.trial.structuredCriteria.length} structured criteria via Gemini AI. Review items flagged for human verification.`,
      );
    } catch (err: any) {
      setActionError(err.message || 'AI criteria extraction failed.');
    } finally {
      setExtractingCriteria(false);
    }
  }

  async function handleVerifySite(trial: ClinicalTrial, locIndex: number, verified: boolean) {
    setActionError(null);
    try {
      const res = await api.verifySite(trial.id, locIndex, verified);
      await onTrialsUpdated();
      setSelectedTrial(res.trial);
    } catch (err: any) {
      setActionError(err.message || 'Could not update site verification status.');
    }
  }

  async function handleSaveCriterionEdit(trial: ClinicalTrial, criterionId: string) {
    setActionError(null);
    try {
      const res = await api.updateCriterion(trial.id, criterionId, editDraft);
      await onTrialsUpdated();
      setSelectedTrial(res.trial);
      setEditingCriterionId(null);
      setEditDraft({});
    } catch (err: any) {
      setActionError(err.message || 'Failed to update criterion.');
    }
  }

  const displayedIndexed = indexedTrials.filter((t) => {
    if (!indexedFilter.trim()) return true;
    const q = indexedFilter.toLowerCase();
    return (
      t.nctId.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.conditions.some((c) => c.toLowerCase().includes(q)) ||
      t.interventions.some((i) => i.toLowerCase().includes(q))
    );
  });

  const activeList = sourceTab === 'indexed' ? displayedIndexed : ctgovResults;
  const isSelectedIndexed = selectedTrial
    ? indexedTrials.some((t) => t.nctId === selectedTrial.nctId)
    : false;

  return (
    <div className="space-y-5">
      {/* Live ClinicalTrials.gov v2 Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              ClinicalTrials.gov Public Registry Search
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Query live ClinicalTrials.gov v2 protocols or inspect indexed workspace & synthetic demo trials.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nctLookup}
              onChange={(e) => setNctLookup(e.target.value)}
              placeholder="NCT ID (e.g. NCT05123456)"
              aria-label="Lookup by NCT Identifier"
              className="px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 w-44"
            />
            <button
              type="button"
              onClick={handleNctLookup}
              disabled={searching}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 cursor-pointer whitespace-nowrap"
            >
              Lookup NCT
            </button>
          </div>
        </div>

        <form onSubmit={handleLiveSearch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ct-cond">
              Condition / Cancer Type
            </label>
            <input
              id="ct-cond"
              type="text"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g., Lung Cancer, TNBC, Melanoma"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ct-intr">
              Intervention / Drug
            </label>
            <input
              id="ct-intr"
              type="text"
              value={intervention}
              onChange={(e) => setIntervention(e.target.value)}
              placeholder="e.g., Pembrolizumab"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ct-loc">
              Location
            </label>
            <input
              id="ct-loc"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, State, or Country"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ct-status">
              Recruitment & Phase
            </label>
            <div className="flex gap-1.5">
              <select
                id="ct-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-1/2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="RECRUITING">Recruiting</option>
                <option value="NOT_YET_RECRUITING">Not Yet</option>
                <option value="ACTIVE_NOT_RECRUITING">Active</option>
                <option value="ALL">All Status</option>
              </select>
              <select
                aria-label="Study Phase"
                value={phaseFilter}
                onChange={(e) => setPhaseFilter(e.target.value)}
                className="w-1/2 px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="ALL">All Phase</option>
                <option value="PHASE1">Phase 1</option>
                <option value="PHASE2">Phase 2</option>
                <option value="PHASE3">Phase 3</option>
              </select>
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={searching}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              <span>Search Registry</span>
            </button>
          </div>
        </form>
      </div>

      {/* Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left List Column */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSourceTab('indexed')}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceTab === 'indexed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Indexed Workspace ({indexedTrials.length})
              </button>
              <button
                type="button"
                onClick={() => setSourceTab('ctgov')}
                className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  sourceTab === 'ctgov' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Live Registry ({ctgovResults.length})
              </button>
            </div>

            {sourceTab === 'indexed' && (
              <input
                type="text"
                value={indexedFilter}
                onChange={(e) => setIndexedFilter(e.target.value)}
                placeholder="Filter indexed trials by NCT, condition, or drug..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            )}
          </div>

          {sourceTab === 'ctgov' && searchError && (
            <div className="m-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">ClinicalTrials.gov API Unavailable</p>
                <p className="mt-0.5">{searchError}</p>
              </div>
            </div>
          )}

          {searching ? (
            <div className="p-6 text-center text-xs text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin text-teal-700 mx-auto mb-2" />
              Querying ClinicalTrials.gov v2 registry...
            </div>
          ) : activeList.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-600">
              <Globe className="w-7 h-7 text-slate-400 mx-auto mb-2" />
              <p className="font-medium text-slate-800">
                {sourceTab === 'ctgov' && !hasSearchedLive
                  ? 'Run a search above to pull live protocols from ClinicalTrials.gov.'
                  : 'No clinical trials matched your current filter.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[680px] overflow-y-auto">
              {sourceTab === 'ctgov' && ctgovTotal > 0 && (
                <div className="px-4 py-2 bg-slate-50 text-xs text-slate-600 font-mono tabular-nums">
                  Showing {ctgovResults.length} of {ctgovTotal.toLocaleString()} public studies
                </div>
              )}
              {activeList.map((trial) => {
                const active = selectedTrial?.nctId === trial.nctId;
                return (
                  <button
                    key={trial.id}
                    type="button"
                    onClick={() => {
                      setSelectedTrial(trial);
                      setActionMessage(null);
                      setActionError(null);
                    }}
                    className={`w-full text-left p-4 transition-colors cursor-pointer ${
                      active ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-semibold text-[#0F2942]">{trial.nctId}</span>
                      <span className="text-slate-600 font-mono">
                        {trial.phase} · {trial.recruitmentStatus}
                      </span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">
                      {trial.briefTitle || trial.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-600 truncate">
                      {trial.conditions.join(' · ') || 'Condition unspecified'}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="truncate">
                        {trial.locations[0]
                          ? `${trial.locations[0].city}, ${trial.locations[0].country}`
                          : 'Location unlisted'}
                      </span>
                      <span className="shrink-0 font-mono">Updated {trial.lastUpdateDate}</span>
                    </div>
                  </button>
                );
              })}
              {sourceTab === 'ctgov' && nextPageToken && (
                <div className="p-3 bg-slate-50 text-center">
                  <button
                    type="button"
                    disabled={searching}
                    onClick={(e) => handleLiveSearch(e as any, nextPageToken)}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer"
                  >
                    Load Next Page
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Detail Panel */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          {!selectedTrial ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Select a clinical trial on the left to inspect eligibility criteria, locations, and provenance.
            </div>
          ) : (
            <>
              {/* Header & Provenance */}
              <div className="space-y-3 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-sm font-bold text-[#0F2942]">
                      {selectedTrial.nctId}
                    </span>
                    <DataOriginTag origin={selectedTrial.dataOrigin} />
                  </div>
                  <a
                    href={`https://clinicaltrials.gov/study/${selectedTrial.nctId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-900"
                  >
                    <span>ClinicalTrials.gov</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <h2 className="font-display text-lg font-bold text-slate-900 leading-snug">
                  {selectedTrial.title}
                </h2>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  <span>Phase: {selectedTrial.phase}</span>
                  <span aria-hidden="true">·</span>
                  <span>Status: {selectedTrial.recruitmentStatus}</span>
                  <span aria-hidden="true">·</span>
                  <span>Sponsor: {selectedTrial.sponsor}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Last Updated: {selectedTrial.lastUpdateDate}</span>
                </div>

                {selectedTrial.siteVerificationNote && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <strong className="font-semibold text-slate-900">Data Provenance Note: </strong>
                    {selectedTrial.siteVerificationNote}
                  </div>
                )}

                {actionMessage && (
                  <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{actionMessage}</span>
                  </div>
                )}

                {actionError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{actionError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {!isSelectedIndexed ? (
                    <button
                      type="button"
                      onClick={() => handleIndexTrial(selectedTrial)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer whitespace-nowrap"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5" />
                      <span>Index Trial to Workspace</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigateToMatching(selectedTrial.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Pre-Screen a Patient</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={extractingCriteria}
                    onClick={() => handleExtractCriteria(selectedTrial)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-teal-300 bg-teal-50 hover:bg-teal-100 text-teal-900 cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {extractingCriteria ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {extractingCriteria
                        ? 'Analysing Eligibility Criteria...'
                        : 'Analyse Eligibility Criteria'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Study Summary & Interventions */}
              <div className="space-y-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">Study Summary</h3>
                <p className="text-xs text-slate-700 leading-relaxed">{selectedTrial.summary}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="font-semibold text-slate-800 mb-1">Conditions</p>
                    <p className="text-slate-600">{selectedTrial.conditions.join(', ') || 'Not listed'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="font-semibold text-slate-800 mb-1">Interventions</p>
                    <p className="text-slate-600">{selectedTrial.interventions.join(', ') || 'Not listed'}</p>
                  </div>
                </div>
              </div>

              {/* Locations (Distinguishing Registry vs Verified Hospital Site) */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Study Locations & Site Verification
                </h3>
                {selectedTrial.locations.length === 0 ? (
                  <p className="text-xs text-slate-500">No study site locations listed in registry.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedTrial.locations.slice(0, 5).map((loc, idx) => (
                      <div
                        key={`${loc.facility}-${idx}`}
                        className="p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2 font-medium text-slate-900">
                            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>{loc.facility}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {loc.city}
                              {loc.state ? `, ${loc.state}` : ''}, {loc.country}
                            </span>
                            {loc.contactName && (
                              <>
                                <span>·</span>
                                <span>{loc.contactName}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded border text-xs font-medium ${
                              loc.siteVerified
                                ? 'bg-teal-50 text-teal-800 border-teal-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {loc.siteVerified ? 'Verified Local Site' : 'Unverified Registry Listing'}
                          </span>
                          {isSelectedIndexed && (
                            <button
                              type="button"
                              onClick={() => handleVerifySite(selectedTrial, idx, !loc.siteVerified)}
                              className="text-xs font-semibold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                            >
                              {loc.siteVerified ? 'Unverify' : 'Verify Site'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Structured Eligibility Criteria Table (Module 5) */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      Structured Eligibility Criteria ({selectedTrial.structuredCriteria.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Source-preserved protocol rules used by the deterministic matching engine.
                    </p>
                  </div>
                  {selectedTrial.criteriaExtractionSource && (
                    <span className="font-mono text-xs text-slate-500">
                      Parser: {selectedTrial.criteriaExtractionSource}
                    </span>
                  )}
                </div>

                {selectedTrial.structuredCriteria.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No structured criteria parsed yet. Click "Extract Structured Criteria (Gemini AI)" above.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                    {selectedTrial.structuredCriteria.map((crit) => {
                      const isEditing = editingCriterionId === crit.id;
                      return (
                        <div key={crit.id} className="p-3.5 text-xs space-y-1.5 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono font-semibold border ${
                                  crit.criterionType === 'INCLUSION'
                                    ? 'bg-sky-50 text-sky-900 border-sky-200'
                                    : 'bg-rose-50 text-rose-900 border-rose-200'
                                }`}
                              >
                                {crit.criterionType}
                              </span>
                              <span className="font-mono font-medium text-slate-700">
                                {crit.category}
                              </span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500">{crit.sourceSection}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {crit.requiresHumanReview && (
                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                                  Human Review Flagged
                                </span>
                              )}
                              {isSelectedIndexed && !isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCriterionId(crit.id);
                                    setEditDraft({
                                      category: crit.category,
                                      ruleOperator: crit.ruleOperator,
                                      targetParameter: crit.targetParameter,
                                      minValue: crit.minValue,
                                      maxValue: crit.maxValue,
                                      requiresHumanReview: crit.requiresHumanReview,
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Review</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <p className="text-slate-900 leading-relaxed">{crit.originalText}</p>

                          <div className="font-mono text-slate-500">
                            Rule: {crit.targetParameter} {crit.ruleOperator}
                            {crit.minValue != null ? ` min=${crit.minValue}` : ''}
                            {crit.maxValue != null ? ` max=${crit.maxValue}` : ''}
                            {crit.unit ? ` ${crit.unit}` : ''}
                            {crit.expectedKeywords?.length
                              ? ` keywords=[${crit.expectedKeywords.join(', ')}]`
                              : ''}
                          </div>

                          {crit.reviewNote && (
                            <p className="text-amber-800 bg-amber-50/70 px-2.5 py-1.5 rounded border border-amber-200">
                              Review Note: {crit.reviewNote}
                            </p>
                          )}

                          {isEditing && (
                            <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    Target Param
                                  </label>
                                  <input
                                    type="text"
                                    value={editDraft.targetParameter || ''}
                                    onChange={(e) =>
                                      setEditDraft({ ...editDraft, targetParameter: e.target.value })
                                    }
                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    Min Value
                                  </label>
                                  <input
                                    type="number"
                                    value={editDraft.minValue ?? ''}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        minValue: e.target.value === '' ? null : Number(e.target.value),
                                      })
                                    }
                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600">
                                    Max Value
                                  </label>
                                  <input
                                    type="number"
                                    value={editDraft.maxValue ?? ''}
                                    onChange={(e) =>
                                      setEditDraft({
                                        ...editDraft,
                                        maxValue: e.target.value === '' ? null : Number(e.target.value),
                                      })
                                    }
                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-white font-mono"
                                  />
                                </div>
                                <div className="flex items-end">
                                  <label className="inline-flex items-center gap-1.5 text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(editDraft.requiresHumanReview)}
                                      onChange={(e) =>
                                        setEditDraft({
                                          ...editDraft,
                                          requiresHumanReview: e.target.checked,
                                        })
                                      }
                                    />
                                    <span>Flagged</span>
                                  </label>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveCriterionEdit(selectedTrial, crit.id)}
                                  className="px-3 py-1 bg-[#0F2942] text-white rounded font-semibold cursor-pointer"
                                >
                                  Save Criterion Rule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingCriterionId(null)}
                                  className="px-3 py-1 border border-slate-300 rounded bg-white text-slate-700 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <details className="pt-2">
                  <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-900">
                    View Raw Registry Eligibility Text
                  </summary>
                  <pre className="mt-2 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedTrial.eligibilityCriteriaRaw}
                  </pre>
                </details>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
