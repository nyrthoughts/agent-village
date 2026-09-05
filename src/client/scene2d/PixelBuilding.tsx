import type { CSSProperties } from 'react';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import { BUILDING_FAMILIES, buildingFamilyFor, type BuildingFamily } from './buildingFamilies.js';
import { translate, type Language } from '../language.js';

const STATUS_LABELS = {
  planned: 'Planned',
  in_progress: 'In progress',
  awaiting_review: 'Awaiting review',
  blocked: 'Blocked',
  verified: 'Verified',
} as const;

const VARIANTS = {
  planned: 'plot',
  in_progress: 'construction',
  awaiting_review: 'review',
  blocked: 'blocked',
  verified: 'complete',
} as const;

interface PixelBuildingProps {
  language?: Language;
  task: DerivedTask;
  project: DerivedProject;
  variant: number;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
}

function VillageHouse({ family }: { family: BuildingFamily }) {
  const tower = family.roof === 'stepped';
  const flat = family.roof === 'flat';
  const stilt = family.roof === 'stilt';
  const left = tower ? 29 : 17;
  const right = tower ? 83 : 96;
  const top = tower ? 26 : flat ? 34 : 43;
  return <svg className="pixel-building__sprite" viewBox="0 0 112 104" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="#274d35" opacity=".24" d="M18 85h77v5h9v9H24v-5h-6z" />
    {stilt && <path fill="#5d4934" d="M21 68h6v25h-6zM86 68h6v25h-6zM35 72h5v22h-5zM73 72h5v22h-5z" />}
    <path fill={family.trimColor} d={`M${left} ${top}H${right}V88H${left}z`} />
    <path fill={family.wallColor} d={`M${left + 3} ${top + 3}H${right - 3}V84H${left + 3}z`} />
    <path fill={family.wallLight} d={`M${left + 3} ${top + 3}h6V81h-6z`} />
    <path fill={family.wallDark} d={`M${right - 11} ${top + 3}h8V84h-8z`} />
    <path fill={family.trimColor} opacity=".2" d={`M${left + 10} 52h${right - left - 20}v2H${left + 10}zM${left + 10} 76h${right - left - 20}v2H${left + 10}z`} />
    {tower ? <>
      <path fill={family.roofDark} d="M25 32V19h8V9h13V3h22v6h13v10h7v13z" />
      <path fill={family.roofColor} d="M29 27v-5h8V13h13V7h14v6h13v9h7v5z" />
      <path fill={family.roofLight} d="M37 16h40v4H37zM29 25h55v4H29z" />
      <path fill={family.trimColor} d="M36 37h13v14H36zM64 37h13v14H64z" />
      <path fill="#c9e8cf" d="M39 40h7v8h-7zM67 40h7v8h-7z" />
      <path fill={family.wallLight} d="M29 54h54v4H29z" />
    </> : flat ? <>
      <path fill={family.roofDark} d="M11 39V19h7v-5h78v5h7v20z" />
      <path fill={family.roofColor} d="M15 23h84v12H15z" />
      <path fill={family.roofLight} d="M19 18h76v5H19zM16 24h4v8h-4z" />
      <path fill={family.roofDark} d="M23 26h64v3H23z" />
      <path fill={family.wallLight} d="M19 40h75v4H19z" />
      {family.index === 7 ? <><path fill="#345a71" d="M35 16h40v14H35z" /><path fill="#8fbcbf" d="M38 18h34v2H38zM38 24h34v2H38zM48 18h2v10h-2zM61 18h2v10h-2z" /></> : <><path fill={family.trimColor} d="M77 5h10v16H77z" /><path fill={family.wallDark} d="M80 7h4v12h-4z" /></>}
    </> : <>
      <path fill={family.trimColor} d="M79 9h11v26H79z" /><path fill={family.wallDark} d="M82 12h5v17h-5z" />
      <path fill={family.roofDark} d="M5 48V40h6v-8h6v-8h6v-8h6V9h54v7h6v8h6v8h6v8h6v8z" />
      <path fill={family.roofColor} d="M11 43v-4h6v-8h6v-8h6v-8h54v8h6v8h6v8h6v4z" />
      <path fill={family.roofLight} d="M31 15h50v4H31zM25 23h62v3H25zM19 31h74v3H19z" />
      <path fill={family.roofDark} opacity=".55" d="M18 38h78v3H18zM42 19h2v4h-2zM66 26h2v5h-2zM31 34h2v4h-2zM78 34h2v4h-2z" />
      <path fill={family.roofLight} d="M9 43h94v3H9z" />
    </>}
    <path fill={family.trimColor} d="M47 60h20v28H47z" /><path fill="#684b34" d="M50 63h14v22H50z" />
    <path fill="#af8150" d="M50 63h4v22h-4zM55 64h7v8h-7z" /><path fill="#ecd28b" d="M61 76h2v3h-2z" />
    <path fill={family.trimColor} d="M27 57h15v17H27zM73 57h15v17H73z" />
    <path fill="#74afb0" d="M30 60h9v10h-9zM76 60h9v10h-9z" /><path fill="#d8eed6" d="M30 60h7v3h-7zM76 60h7v3h-7z" />
    <path fill={family.wallLight} d="M25 74h19v3H25zM71 74h19v3H71z" />
    <path fill="#75634b" d="M42 88h31v5H42zM39 93h37v4H39z" /><path fill="#ccb995" d="M45 88h25v3H45zM42 93h31v2H42z" />
    {stilt && <><path fill={family.trimColor} d="M13 77h29v4H13zM71 77h29v4H71zM15 70h3v14h-3zM95 70h3v14h-3z" /><path fill={family.wallLight} d="M13 75h29v2H13zM71 75h29v2H71z" /></>}
    {family.index === 0 && <><path fill={family.trimColor} d="M19 47h4v35h-4zM91 47h3v35h-3zM22 80h24v3H22zM68 80h24v3H68z" /><path fill="#476b3e" d="M26 76h16v5H26z" /><path fill="#de987c" d="M28 74h3v3h-3zM36 75h3v3h-3z" /></>}
  </svg>;
}

export function PixelBuilding({ task, project, variant, onSelect, language = 'en' }: PixelBuildingProps) {
  const status = project.observation
    ? `${project.observation.sessions.length} sessions · ${project.observation.sessions.filter((session) => session.state === 'working').length} ${translate(language, 'en cours')}`
    : STATUS_LABELS[task.effectiveStatus];
  const family = project.observation?.buildingFamilyIndex !== undefined
    ? BUILDING_FAMILIES[project.observation.buildingFamilyIndex % BUILDING_FAMILIES.length]!
    : buildingFamilyFor(task.id);
  const familyStyle = {
    '--building-roof': family.roofColor,
    '--building-roof-light': family.roofLight,
    '--building-roof-dark': family.roofDark,
    '--building-wall': family.wallColor,
    '--building-wall-light': family.wallLight,
    '--building-wall-dark': family.wallDark,
    '--building-trim': family.trimColor,
  } as CSSProperties;
  return (
    <button
      type="button"
      className={`pixel-building pixel-building--${task.effectiveStatus}`}
      data-testid={`pixel-building-${task.id}`}
      data-task-id={task.id}
      data-building-variant={VARIANTS[task.effectiveStatus]}
      data-stage={project.observation ? 'roof' : task.progress.stage}
      data-observed={project.observation ? 'true' : undefined}
      data-family={family.id}
      data-roof-shape={family.roof}
      data-roof-palette={variant}
      data-sprite-scale="compact"
      style={familyStyle}
      aria-label={`${task.title}. ${status}.${project.observation ? '' : ` ${task.owner ? translate(language, 'Responsable {name}.', { name: task.owner }) : translate(language, 'Sans responsable.')}`}`}
      onClick={(event) => onSelect(task, event.currentTarget, project)}
    >
      {project.observation ? <VillageHouse family={family} /> : <>
      <span className="pixel-building__shadow" aria-hidden="true" />
      <span className="pixel-building__plot" aria-hidden="true"><i /><i /><i /><i /></span>
      <span className="pixel-building__body" aria-hidden="true">
        <span className="pixel-building__roof" />
        <span className="pixel-building__wall" />
        <span className="pixel-building__door" />
        <span className="pixel-building__porch" />
        <span className="pixel-building__window pixel-building__window--left" />
        <span className="pixel-building__window pixel-building__window--right" />
        <span className="pixel-building__frame"><i /><i /><i /></span>
      </span>
      </>}
      <span className="pixel-building__status-mark" aria-hidden="true" />
      <span className="pixel-building__label"><strong>{task.title}</strong><small>{status}</small></span>
    </button>
  );
}
