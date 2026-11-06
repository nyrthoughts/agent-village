import { useState } from 'react';
import type { ProjectRow } from '../../shared/boardView.js';
import type { SessionEntity } from '../../shared/projector.js';
import { saveMapping } from '../api/client.js';
import type { Language } from '../language.js';
import { Stamp, type Translate } from './format.js';

/** Hook-only identities. The owner attaches them explicitly; the server writes a private mapping file. */
export function UnmatchedInbox({ sessions, projects, canMap, t, language, now }: {
  sessions: SessionEntity[]; projects: ProjectRow[]; canMap: boolean; t: Translate; language: Language; now: number;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'saving' | 'saved' | 'failed'>>({});
  if (sessions.length === 0) return null;
  return <section className="unmatched" aria-labelledby="unmatched-title">
    <header><h2 id="unmatched-title">{t('Non rattachés')} <span className="count">{sessions.length}</span></h2>
      <p>{t('Sessions reçues sans identité de projet fiable. Rien n’est deviné à partir des noms.')}</p></header>
    <ul>
      {sessions.map((session) => <li key={session.id} data-anchor={`unmatched:${session.id}`}>
        <strong>{session.title}</strong>
        <small>{session.tool} · {session.stateSource}{session.hint ? ` · ${t('indice : {hint}', { hint: session.hint })}` : ''} · <Stamp at={session.stateAt} language={language} now={now} /></small>
        {canMap && <form onSubmit={async (event) => {
          event.preventDefault();
          const projectId = choice[session.id];
          if (!projectId) return;
          setStatus((current) => ({ ...current, [session.id]: 'saving' }));
          try { await saveMapping(session.id, projectId); setStatus((current) => ({ ...current, [session.id]: 'saved' })); }
          catch { setStatus((current) => ({ ...current, [session.id]: 'failed' })); }
        }}>
          <label>{t('Rattacher {name} à', { name: session.title.slice(0, 40) })}
            <select value={choice[session.id] ?? ''} onChange={(event) => setChoice((current) => ({ ...current, [session.id]: event.target.value }))}>
              <option value="">{t('Choisir un projet')}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!choice[session.id] || status[session.id] === 'saving'}>{t('Rattacher')}</button>
          {status[session.id] === 'saved' && <span role="status">{t('Rattachement enregistré dans un fichier privé hors dépôt.')}</span>}
          {status[session.id] === 'failed' && <span role="alert">{t('Rattachement impossible. Réessayez.')}</span>}
        </form>}
      </li>)}
    </ul>
  </section>;
}
