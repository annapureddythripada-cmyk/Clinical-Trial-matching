import { useState, type FormEvent } from 'react';
import { ShieldCheck, ArrowRight, UserCheck, Stethoscope, Settings2, AlertCircle } from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import type { UserAccount, UserRole } from '../types/clinical';
import { BrandMark } from './BrandMark';

interface AuthScreenProps {
  onAuthenticated: (user: UserAccount) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<UserRole>('RESEARCH_COORDINATOR');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (!consentAccepted) {
        setError('You must acknowledge the Data-Use & Clinical Boundary Notice before registering.');
        return;
      }
    }

    setLoading(true);
    try {
      const session =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register({
              email,
              password,
              fullName,
              role,
              organization: organization || 'Clinical Research Site',
              consentAccepted,
            });
      setStoredToken(session.token);
      onAuthenticated(session.user);
    } catch (err: any) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoSignIn(demoRole: UserRole) {
    setError(null);
    setLoading(true);
    try {
      const session = await api.demoLogin(demoRole);
      setStoredToken(session.token);
      onAuthenticated(session.user);
    } catch (err: any) {
      setError(err.message || 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Brand & Clinical Facility Panel */}
      <div className="lg:w-1/2 bg-[#0F2942] text-white flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-1.5 rounded-lg border border-white/15">
              <BrandMark compact />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white">
              Clinical Trial Match AI
            </span>
          </div>

          <div className="mt-10 max-w-xl">
            <p className="text-xs font-medium tracking-wide text-teal-300 mb-3">
              Research Pre-Screening Decision Support
            </p>
            <h1
              className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Evidence-backed trial discovery and patient pre-screening.
            </h1>
            <p className="mt-4 text-sm lg:text-base text-slate-300 leading-relaxed max-w-lg">
              Compare structured patient clinical records against public ClinicalTrials.gov protocols with deterministic threshold verification, source citations, and explicit missing-documentation detection.
            </p>
          </div>
        </div>

        {/* Facility Image Container */}
        <div className="relative z-10 my-8 rounded-xl overflow-hidden border border-white/15 bg-slate-900/50">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/clinical_hero_research_1794909897367.jpg"
              alt="Clinical research center workspace"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-52 lg:h-64 object-cover"
            />
          ) : (
            <div className="w-full h-52 lg:h-64 bg-gradient-to-br from-[#163A5C] to-[#0D9488]/40 flex items-center justify-center p-6">
              <div className="text-center">
                <ShieldCheck className="w-10 h-10 text-teal-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-100">Clinical Research Pre-Screening Workspace</p>
              </div>
            </div>
          )}
          <div className="p-4 bg-[#0B1F33] border-t border-white/10 text-xs text-slate-300 leading-relaxed">
            <strong className="text-white font-semibold">Clinical Safety Boundary:</strong> This prototype assists research staff with initial pre-screening. It never determines final eligibility, enrolls patients, or recommends medical treatments.
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <span>Synthetic Demo Mode Ready</span>
          <span aria-hidden="true">·</span>
          <span>Source-Cited Provenance</span>
          <span aria-hidden="true">·</span>
          <span>Human Review Required</span>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Quick Safe Demo Mode Access */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Instant Synthetic Demo Workspace
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Explore pre-loaded synthetic patient profiles and sample trials by role. Do not enter real patient PHI.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemoSignIn('RESEARCH_COORDINATOR')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Coordinator</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemoSignIn('CLINICIAN')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                <span>Clinician</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleDemoSignIn('ADMINISTRATOR')}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Settings2 className="w-3.5 h-3.5 shrink-0" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Standard Sign-In / Registration Card */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="auth-name">
                      Full Name & Credentials
                    </label>
                    <input
                      id="auth-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Jordan Patel, CCRP"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="auth-role">
                        Workspace Role
                      </label>
                      <select
                        id="auth-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="RESEARCH_COORDINATOR">Research Coordinator</option>
                        <option value="CLINICIAN">Clinician</option>
                        <option value="ADMINISTRATOR">Administrator</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="auth-org">
                        Site / Organization
                      </label>
                      <input
                        id="auth-org"
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="e.g., Metro Oncology"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="auth-email">
                  Work Email
                </label>
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coordinator@clinicalmatch.demo"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              {mode === 'register' && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                  />
                  <span>
                    I acknowledge this is a research pre-screening prototype (not HIPAA/GDPR/DPDP certified) and will use synthetic or authorized de-identified data only.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-semibold text-white bg-[#0F2942] hover:bg-[#163A5C] rounded-lg transition-colors disabled:opacity-60 cursor-pointer"
              >
                <span>{loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {mode === 'login' && (
              <p className="mt-4 text-xs text-slate-500 text-center">
                Demo credentials: <span className="font-mono">coordinator@clinicalmatch.demo</span> /{' '}
                <span className="font-mono">DemoCoordinator2026!</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
