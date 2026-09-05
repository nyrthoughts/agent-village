import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { startAuthentication, startRegistration, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { clearSession, getSession, setSession, subscribeSession, sessionHeaders, type OwnerSession } from './api/session.js';
import { LANGUAGE_KEY, savedLanguage, translate, type Language } from './language.js';
import './AuthGate.css';

interface AuthStatus { native: boolean; enrolled?: boolean; canonicalOrigin?: string; bootstrapReady?: boolean }

export function canonicalLocalUrl(canonical: string, current: string): string {
  const target = new URL(canonical);
  const source = new URL(current);
  if (target.protocol !== 'http:' || target.hostname !== 'localhost' || target.port !== source.port
    || !['localhost', '127.0.0.1'].includes(source.hostname) || target.username || target.password
    || target.pathname !== '/' || target.search || target.hash) throw new Error('Invalid local origin');
  return target.href;
}

export function AuthGate({ children, basePath = import.meta.env.BASE_URL, fetchImpl = fetch }: {
  children: ReactNode; basePath?: string; fetchImpl?: typeof fetch;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(basePath !== '/' ? { native: false } : null);
  const [language, setLanguage] = useState<Language>(savedLanguage);
  const [error, setError] = useState<'unavailable' | 'verification' | 'setup' | null>(null);
  const [pending, setPending] = useState(false);
  const [bootstrap, setBootstrap] = useState('');
  const [retry, setRetry] = useState(0);
  const session = useSyncExternalStore(subscribeSession, getSession);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const supported = typeof window.PublicKeyCredential !== 'undefined';

  useEffect(() => {
    const update = (event: Event) => {
      const value = (event as CustomEvent<unknown>).detail;
      if (value === 'fr' || value === 'en') setLanguage(value);
    };
    window.addEventListener('agent-village:language', update);
    return () => window.removeEventListener('agent-village:language', update);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Preference storage is optional. */ }
  }, [language]);

  useEffect(() => {
    if (basePath !== '/') return;
    let active = true;
    setError(null);
    void fetchImpl('/api/auth/status', { headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error('Auth status unavailable');
        const value = await response.json() as AuthStatus;
        if (!value || typeof value.native !== 'boolean') throw new Error('Invalid status');
        if (value.native) {
          if (typeof value.enrolled !== 'boolean' || typeof value.canonicalOrigin !== 'string') throw new Error('Invalid status');
          const target = canonicalLocalUrl(value.canonicalOrigin, window.location.href);
          if (new URL(target).origin !== window.location.origin) {
            if (active) window.location.replace(target);
            return;
          }
        }
        if (active) setStatus(value);
      }).catch(() => { if (active) setError('unavailable'); });
    return () => { active = false; };
  }, [basePath, fetchImpl, retry]);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchImpl(path, { method: 'POST', headers: { 'content-type': 'application/json', ...sessionHeaders(path) },
      body: JSON.stringify(body), credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 403 ? 'setup' : 'verification');
    return await response.json() as T;
  }

  async function unlock() {
    if (!status?.native || pending || !supported) return;
    setPending(true); setError(null);
    try {
      let ownerSession: OwnerSession;
      if (!status.enrolled) {
        const bootstrapToken = bootstrap.trim();
        const { challengeId, options } = await post<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/auth/enroll/options', { bootstrapToken });
        const response = await startRegistration({ optionsJSON: options });
        ownerSession = await post('/api/auth/enroll/verify', { bootstrapToken, challengeId, response });
      } else {
        const { challengeId, options } = await post<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/login/options', {});
        const response = await startAuthentication({ optionsJSON: options });
        ownerSession = await post('/api/auth/login/verify', { challengeId, response });
      }
      setSession(ownerSession);
      setStatus({ ...status, enrolled: true });
    } catch (cause) { setError(cause instanceof Error && cause.message === 'setup' ? 'setup' : 'verification'); }
    finally { setBootstrap(''); setPending(false); }
  }

  function lock() {
    // Capture the current bearer before clearing UI; network failure never keeps private content on screen.
    void post('/api/auth/logout', {}).catch(() => undefined);
    clearSession();
  }

  if (status?.native === false) return <>{children}</>;
  if (status?.native && session) return <><button className="owner-lock" onClick={lock}>{t('Verrouiller')}</button>{children}</>;

  return <main className="owner-gate">
    <div className="owner-gate__language"><label>Langue / Language <select aria-label="Langue / Language" value={language}
      onChange={event => setLanguage(event.target.value === 'en' ? 'en' : 'fr')}><option value="fr">Français</option><option value="en">English</option></select></label></div>
    <section className="owner-gate__card" aria-labelledby="owner-title">
      <div className="owner-gate__house" aria-hidden="true"><span /></div>
      <small>AGENT VILLAGE · {t('ACCÈS PERSONNEL')}</small>
      <h1 id="owner-title">{t('Votre village, votre clé.')}</h1>
      <p>{t('Les projets restent derrière cette porte. Aucune conversation n’est chargée avant votre authentification.')}</p>
      {!status && !error && <p role="status">{t('Vérification de l’accès…')}</p>}
      {error && <p className="owner-gate__error" role="alert">{t(error === 'unavailable' ? 'Accès indisponible. Le village reste verrouillé.'
        : error === 'setup' ? 'Code absent, expiré ou incorrect. Relancez la configuration locale.' : 'Authentification non terminée. Vous pouvez réessayer.')}</p>}
      {status?.native && <form onSubmit={event => { event.preventDefault(); void unlock(); }}>
        {!status.enrolled && <>
          <label htmlFor="bootstrap">{t('Code de configuration privé')}</label>
          <input id="bootstrap" type="password" autoComplete="off" spellCheck={false} value={bootstrap} onChange={event => setBootstrap(event.target.value)} />
          <p className="owner-gate__hint">{t('Première visite : utilisez le code local bootstrap.txt, puis créez votre clé d’accès. Ne partagez pas ce code.')}</p>
          {!status.bootstrapReady && <p>{t('La configuration locale doit être lancée avant la première visite.')}</p>}
        </>}
        {!supported && <p role="alert">{t('Ce navigateur ne propose pas les clés d’accès. Ouvrez cette adresse dans Chrome ou Safari sur ce Mac.')}</p>}
        <button type="submit" disabled={pending || !supported || (!status.enrolled && (!status.bootstrapReady || bootstrap.trim().length !== 43))}>
          {t(pending ? 'Validation en cours…' : status.enrolled ? 'Ouvrir mon village' : 'Créer ma clé d’accès')}
        </button>
        <p className="owner-gate__hint">{t('Clé d’accès requise · session de 30 minutes · aucun mot de passe stocké')}</p>
      </form>}
      {error === 'unavailable' && <button onClick={() => setRetry(value => value + 1)}>{t('Réessayer')}</button>}
      <footer>{t('Cet accès est local à ce Mac. La démo GitHub publique ne contient pas vos conversations.')}</footer>
    </section>
  </main>;
}
