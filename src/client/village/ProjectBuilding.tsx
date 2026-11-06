import type { DerivedProject } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { AgentCharacter } from './AgentCharacter.js';
import { PipelineDots } from './PipelineDots.js';
import { isConfirmedWorking } from '../../shared/workerPresentation.js';
import { toolLabel } from './AgentCharacter.js';

function buildingSpriteKey(tool: string): string {
  if (tool === 'claude-code') return 'claude';
  if (tool === 'other') return 'forge';
  return tool;
}

function dominantTool(sessions: ObservedSession[]): string {
  const counts: Record<string, number> = {};
  for (const s of sessions) {
    const t = s.tool;
    counts[t] = (counts[t] ?? 0) + 1;
  }
  let best = 'codex';
  let bestCount = 0;
  for (const [tool, count] of Object.entries(counts)) {
    if (count > bestCount) { best = tool; bestCount = count; }
  }
  return best;
}

export function ProjectBuilding({
  project,
  language,
  now,
  onSelectSession,
  style,
}: {
  project: DerivedProject;
  language: Language;
  now: number;
  onSelectSession?: (session: ObservedSession, trigger: HTMLButtonElement) => void;
  style?: React.CSSProperties;
}) {
  const sessions: ObservedSession[] = project.observation?.sessions ?? [];
  const roots = sessions.filter((s) => s.role !== 'helper');
  const hasActive = sessions.some((s) => isConfirmedWorking(s, now));
  const tool = dominantTool(sessions);
  const spriteKey = buildingSpriteKey(tool);

  return (
    <div className="iso-cluster" style={style} role="group" aria-label={project.name}>
      <div className="iso-cluster__building">
        <img
          src={`/sprites/building-${spriteKey}.png`}
          alt={`${project.name} building`}
          className="iso-cluster__img"
          draggable={false}
        />
        <div className="iso-cluster__glow" data-tool={spriteKey} />
      </div>
      <div className="iso-cluster__label">
        <span className="iso-cluster__name">{project.name}</span>
        <span className={`iso-cluster__online iso-cluster__online--${hasActive ? 'active' : 'idle'}`} />
      </div>
      <div className="iso-cluster__agents">
        {roots.slice(0, 4).map((session) => (
          <AgentCharacter
            key={session.id}
            session={session}
            onClick={onSelectSession}
            size={40}
          />
        ))}
        {roots.length > 4 && (
          <span className="iso-cluster__more">+{roots.length - 4}</span>
        )}
      </div>
      <PipelineDots sessions={sessions} language={language} />
    </div>
  );
}
