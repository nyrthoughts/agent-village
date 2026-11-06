import type { DerivedProject } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { AgentCharacter } from './AgentCharacter.js';
import { PipelineDots } from './PipelineDots.js';
import { isConfirmedWorking } from '../../shared/workerPresentation.js';

export function ProjectBuilding({
  project,
  index,
  language,
  now,
  onSelectSession,
}: {
  project: DerivedProject;
  index: number;
  language: Language;
  now: number;
  onSelectSession?: (session: ObservedSession, trigger: HTMLButtonElement) => void;
}) {
  const sessions: ObservedSession[] = project.observation?.sessions ?? [];
  const roots = sessions.filter((s) => s.role !== 'helper');
  const hasActive = sessions.some((s) => isConfirmedWorking(s, now));
  const windowCount = Math.max(2, Math.min(4, roots.length));

  return (
    <div className={`iso-cluster iso-cluster--${index % 8}`}>
      <div className="iso-building" role="group" aria-label={project.name}>
        <div className="iso-building__structure">
          <div className="iso-building__roof" />
          <div className="iso-building__base">
            <div className="iso-building__windows">
              {Array.from({ length: windowCount }, (_, i) => (
                <span
                  key={i}
                  className={`iso-building__window iso-building__window--${
                    i < roots.filter((s) => isConfirmedWorking(s, now)).length ? 'lit' : 'dark'
                  }`}
                />
              ))}
            </div>
            <div className="iso-building__door" />
          </div>
        </div>
        <div className="iso-building__label">
          {project.name}
          <span className={`building-online building-online--${hasActive ? 'active' : 'idle'}`} />
        </div>
      </div>
      <div className="iso-agents">
        {roots.slice(0, 6).map((session) => (
          <AgentCharacter
            key={session.id}
            session={session}
            onClick={onSelectSession}
          />
        ))}
      </div>
      <PipelineDots sessions={sessions} language={language} />
    </div>
  );
}
