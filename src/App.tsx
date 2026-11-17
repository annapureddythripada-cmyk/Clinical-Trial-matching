import { useEffect, useState } from 'react';
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  FlaskConical,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AdminGovernanceView } from './components/AdminGovernanceView';
import { AnalyticsView } from './components/AnalyticsView';
import { AuthScreen } from './components/AuthScreen';
import { BrandMark } from './components/BrandMark';
import { DashboardView, type NavSection } from './components/DashboardView';
import { MatchingReviewView } from './components/MatchingReviewView';
import { PatientProfileView } from './components/PatientProfileView';
import { ReportsView } from './components/ReportsView';
import { TrialDiscoveryView } from './components/TrialDiscoveryView';
import { api, getStoredToken, setStoredToken } from './lib/api';
import type {
  AnalyticsSnapshot,
  ClinicalTrial,
  PatientProfile,
  ScreeningMatch,
  UserAccount,
  WorkspacePolicy,
} from './types/clinical';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  Icon: typeof LayoutDashboard;
}> = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'trials', label: 'Find Clinical Trials', Icon: FlaskConical },
  { id: 'patients', label: 'Patient Profiles', Icon: Users },
  { id: 'matching', label: 'Patient Matching', Icon: GitCompare },
  { id: 'results', label: 'Review Results', Icon: ClipboardCheck },
  { id: 'reports', label: 'Reports', Icon: FileText },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3 },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [policy, setPolicy] = useState<WorkspacePolicy>({
    aiProcessingEnabled: true,
    requireConsentBeforeAi: true,
    requireFactReviewBeforeMatch: true,
    demoModeActive: true,
  });
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [trials, setTrials] = useState<ClinicalTrial[]>([]);
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [matches, setMatches] = useState<ScreeningMatch[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [preselectMatchId, setPreselectMatchId] = useState<string | null>(null);
  const [preselectPatientId, setPreselectPatientId] = useState<string | null>(null);
  const [preselectTrialId, setPreselectTrialId] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  async function loadAllWorkspaceData() {
    setDataLoading(true);
    try {
      const [analyticsRes, trialsRes, patientsRes, matchesRes, policyRes] = await Promise.all([
        api.getAnalytics(),
        api.listTrials(),
        api.listPatients(),
        api.listMatches(),
        api.getPolicy(),
      ]);
      setAnalytics(analyticsRes);
      setTrials(trialsRes.trials);
      setPatients(patientsRes.patients);
      setMatches(matchesRes.matches);
      setPolicy(policyRes.policy);
    } catch {
      // Errors handled individually inside subviews
    } finally {
      setDataLoading(false);
    }
  }

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    api
      .me()
      .then((res) => {
        setUser(res.user);
        setPolicy(res.policy);
        return loadAllWorkspaceData();
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => setBootstrapping(false));
  }, []);

  async function handleAuthenticated(authedUser: UserAccount) {
    setUser(authedUser);
    await loadAllWorkspaceData();
  }

  async function handleSignOut() {
    await api.logout().catch(() => {});
    setStoredToken(null);
    setUser(null);
    setActiveNav('dashboard');
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-600">
        Loading Clinical Trial Match AI workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeNav) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Navy Blue Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0F2942] text-slate-100 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <BrandMark compact />
              <span className="font-display text-sm font-bold tracking-tight text-white truncate">
                Clinical Trial Match AI
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1 rounded text-slate-300 hover:text-white cursor-pointer"
              aria-label="Close menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="p-3 space-y-1" aria-label="Primary Sidebar Navigation">
            {NAV_ITEMS.map(({ id, label, Icon }) => {
              const active = activeNav === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveNav(id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-teal-600/25 text-white border border-teal-400/30'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-300' : 'text-slate-400'}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Account Footer in Sidebar */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/coordinator_avatar_1794909898361.jpg"
                alt={user.fullName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-teal-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                {user.fullName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] font-mono text-teal-300 truncate">
                {user.role.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 text-xs font-medium rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="hidden sm:inline font-medium text-slate-700">Workspace</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <h1 className="font-display text-base font-bold text-slate-900 truncate">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {policy.demoModeActive && (
              <span className="hidden md:inline text-xs font-mono text-slate-600">
                Synthetic Demo Mode Active
              </span>
            )}
            <button
              type="button"
              onClick={() => setActiveNav('matching')}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#0F2942] hover:bg-[#163A5C] text-white cursor-pointer whitespace-nowrap"
            >
              New Pre-Screen
            </button>
          </div>
        </header>

        {/* Active View Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeNav === 'dashboard' && (
            <DashboardView
              analytics={analytics}
              matches={matches}
              loading={dataLoading}
              onNavigate={(section) => setActiveNav(section)}
              onSelectMatch={(matchId) => {
                setPreselectMatchId(matchId);
                setActiveNav('results');
              }}
            />
          )}

          {activeNav === 'trials' && (
            <TrialDiscoveryView
              indexedTrials={trials}
              onTrialsUpdated={loadAllWorkspaceData}
              onNavigateToMatching={(trialId) => {
                setPreselectTrialId(trialId);
                setActiveNav('matching');
              }}
            />
          )}

          {activeNav === 'patients' && (
            <PatientProfileView
              patients={patients}
              onPatientsUpdated={loadAllWorkspaceData}
              onNavigateToMatching={(patientId) => {
                setPreselectPatientId(patientId);
                setActiveNav('matching');
              }}
            />
          )}

          {activeNav === 'matching' && (
            <MatchingReviewView
              mode="matching"
              currentUser={user}
              patients={patients}
              trials={trials}
              matches={matches}
              initialSelectedMatchId={preselectMatchId}
              initialPatientId={preselectPatientId}
              initialTrialId={preselectTrialId}
              onMatchesUpdated={loadAllWorkspaceData}
            />
          )}

          {activeNav === 'results' && (
            <MatchingReviewView
              mode="results"
              currentUser={user}
              patients={patients}
              trials={trials}
              matches={matches}
              initialSelectedMatchId={preselectMatchId}
              initialPatientId={preselectPatientId}
              initialTrialId={preselectTrialId}
              onMatchesUpdated={loadAllWorkspaceData}
            />
          )}

          {activeNav === 'reports' && (
            <ReportsView matches={matches} patients={patients} trials={trials} />
          )}

          {activeNav === 'analytics' && <AnalyticsView analytics={analytics} />}

          {activeNav === 'settings' && (
            <AdminGovernanceView
              currentUser={user}
              policy={policy}
              onWorkspaceDataChanged={loadAllWorkspaceData}
            />
          )}
        </main>

        {/* Quiet Clinical Boundary Footer */}
        <footer className="px-6 py-3 border-t border-slate-200 bg-white text-xs text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2 print:hidden">
          <span>
            Clinical Trial Match AI · Research Pre-Screening Decision Support Prototype (Not for diagnostic or treatment decisions)
          </span>
          <span>Final eligibility must be confirmed by authorized clinical research professionals.</span>
        </footer>
      </div>
    </div>
  );
}
