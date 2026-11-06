import type { Language } from '../language.js';
import { translate, LANGUAGE_KEY } from '../language.js';

export function VillageHeader({
  language,
  onLanguageChange,
  sessionCount,
  projectCount,
}: {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  sessionCount: number;
  projectCount: number;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) =>
    translate(language, key, values);

  return (
    <header className="village-header" role="banner">
      <div className="village-header__brand">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 4h16v16H4z" fill="currentColor" opacity="0.1" />
          <path d="M8 3L12 7L16 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 10h16M4 14h16" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <path d="M6 8h12v10H6z" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <circle cx="9" cy="13" r="1.5" fill="currentColor" />
          <circle cx="15" cy="13" r="1.5" fill="currentColor" />
        </svg>
        AGENT VILLAGE
      </div>
      <span className="village-header__live" aria-live="polite">
        <span className="village-header__live-dot" />
        LIVE
      </span>
      <span className="village-header__subtitle">
        {t('Toutes les activités en temps réel')} · {projectCount} {t('projets')} · {sessionCount} sessions
      </span>
      <div className="village-header__controls">
        <span className="village-header__lang">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <ellipse cx="8" cy="8" rx="3.5" ry="7" fill="none" stroke="currentColor" strokeWidth="1" />
            <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1" />
          </svg>
          <select
            aria-label="Langue / Language"
            value={language}
            onChange={(e) => {
              const value = e.target.value as Language;
              onLanguageChange(value);
              try { localStorage.setItem(LANGUAGE_KEY, value); } catch { /* optional */ }
            }}
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
        </span>
      </div>
    </header>
  );
}
