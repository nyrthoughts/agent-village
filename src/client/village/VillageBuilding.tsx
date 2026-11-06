import type { CSSProperties } from 'react';
import type { ProjectRow } from '../../shared/boardView.js';
import { paletteFor } from './buildingPalettes.js';
import type { Language } from '../language.js';
import type { Translate } from '../board/format.js';

const STATUS_LABEL = { blocked: 'Bloqué', waiting: 'En attente', working: 'Actif', quiet: 'Calme' } as const;

interface Props {
  row: ProjectRow;
  t: Translate;
  language: Language;
  onSelect: (projectId: string) => void;
}

export function VillageBuilding({ row, t, language: _language, onSelect }: Props) {
  const palette = paletteFor(row.id);
  const familyStyle = {
    '--building-roof': palette.roofColor,
    '--building-roof-light': palette.roofLight,
    '--building-roof-dark': palette.roofDark,
    '--building-wall': palette.wallColor,
    '--building-wall-light': palette.wallLight,
    '--building-wall-dark': palette.wallDark,
    '--building-trim': palette.trimColor,
  } as CSSProperties;

  const statusText = t(STATUS_LABEL[row.status.kind]);
  const proofStates = row.ladder.map((s) => s.state);

  return (
    <button
      type="button"
      className={`pixel-building pixel-building--${row.status.kind}`}
      data-project-id={row.id}
      data-roof={palette.roof}
      style={familyStyle}
      aria-label={`${row.name}. ${statusText}.${row.attention > 0 ? ` ${row.attention} ${t('à traiter')}.` : ''}`}
      onClick={() => onSelect(row.id)}
    >
      <span className="pixel-building__shadow" aria-hidden="true" />
      <span className="pixel-building__body" aria-hidden="true">
        <span className="pixel-building__roof" />
        <span className="pixel-building__wall" />
        <span className="pixel-building__door" />
        <span className="pixel-building__porch" />
        <span className="pixel-building__window pixel-building__window--left" />
        <span className="pixel-building__window pixel-building__window--right" />
      </span>
      <span className="pixel-building__status-mark" aria-hidden="true" />
      {row.attention > 0 && <span className="pixel-building__attention" aria-hidden="true">{row.attention}</span>}
      <span className="pixel-building__proofs" aria-hidden="true">
        {proofStates.map((state, i) => <span key={i} className={`pixel-building__proof-dot pixel-building__proof-dot--${state}`} />)}
      </span>
      <span className="pixel-building__label">
        <strong>{row.name}</strong>
        <small>{statusText}{row.objective ? ` · ${row.objective.slice(0, 50)}` : ''}</small>
      </span>
    </button>
  );
}
