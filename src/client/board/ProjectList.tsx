import type { ProjectRow } from '../../shared/boardView.js';
import type { Language } from '../language.js';
import { duration, relative, type Translate } from './format.js';
import { ProofLadder } from './ProofLadder.js';

const STATUS_LABEL = { blocked: 'Bloqué (déclaré)', waiting: 'Signal d’attente (observé)', working: 'Actif (observé)', quiet: 'Calme' } as const;

/** One line per project. Selection is kept by id; the order is frozen with the rest of the reading view. */
export function ProjectList({ rows, selectedId, openId, fresh, t, language, now, onSelect, onOpen }: {
  rows: ProjectRow[]; selectedId?: string; openId?: string; fresh: ReadonlySet<string>; t: Translate; language: Language; now: number;
  onSelect: (id: string) => void; onOpen: (id: string) => void;
}) {
  return <section className="projects" aria-labelledby="projects-title">
    <header><h2 id="projects-title">{t('Projets')} <span className="count">{rows.length}</span></h2><p>{t('Une ligne par projet · j/k : naviguer · Entrée : ouvrir · Échap : fermer')}</p></header>
    {rows.length === 0 && <p className="board-empty">{t('Aucun projet observé.')}</p>}
    <ul className="projects__rows">
      {rows.map((row) => <li key={row.id} data-anchor={`row:${row.id}`} data-project-id={row.id}
        className={`project-row${row.id === selectedId ? ' is-selected' : ''}${row.id === openId ? ' is-open' : ''}${fresh.has(row.id) ? ' is-fresh' : ''}`}>
        <button type="button" className="project-row__main" aria-current={row.id === openId ? 'true' : undefined} data-selected={row.id === selectedId || undefined}
          onFocus={() => onSelect(row.id)} onClick={() => onOpen(row.id)}>
          <span className="project-row__name"><strong>{row.name}</strong>{row.attention > 0 && <span className="count count--alert">{t('{count} à traiter', { count: row.attention })}</span>}</span>
          <span className="project-row__goal">{row.objective ?? t('Objectif non défini')}</span>
          <span className={`project-row__status status--${row.status.kind}`}>
            {t(STATUS_LABEL[row.status.kind])}{row.status.at && <> · <time dateTime={row.status.at} title={row.status.at}>{row.status.kind === 'quiet' ? relative(language, row.status.at, now) : duration(language, row.status.at, now)}</time></>}
          </span>
          {row.next && <span className="project-row__next"><small>{t('Prochaine action déclarée')}</small> {row.next.text}</span>}
          {row.blockers.length > 0 && <span className="project-row__deps"><small>{t('Dépendances déclarées')}</small> {row.blockers.map((blocker) => blocker.text).join(' · ')}</span>}
          {row.milestones && <span className="project-row__milestones">{t('{done}/{total} jalons validés', { done: row.milestones.validated, total: row.milestones.total })}</span>}
          {row.yamlProofs && <span className="project-row__proofs">{t('{done}/{total} tâches YAML avec preuve vérifiée', { done: row.yamlProofs.verified, total: row.yamlProofs.total })}</span>}
        </button>
        <ProofLadder steps={row.ladder} t={t} language={language} now={now} />
      </li>)}
    </ul>
  </section>;
}
