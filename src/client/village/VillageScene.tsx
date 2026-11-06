import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { ProjectBuilding } from './ProjectBuilding.js';

export function VillageScene({
  village,
  language,
  now,
  onSelectSession,
}: {
  village: DerivedWorkspace;
  language: Language;
  now: number;
  onSelectSession?: (session: ObservedSession, trigger: HTMLButtonElement) => void;
}) {
  const projects = village.projects.slice(0, 8);

  return (
    <section className="iso-scene" aria-label="Village">
      <div className="iso-world">
        <div className="iso-ground" />
        <div className="iso-grid" />
        {projects.map((project, i) => (
          <ProjectBuilding
            key={project.id}
            project={project}
            index={i}
            language={language}
            now={now}
            onSelectSession={onSelectSession}
          />
        ))}
      </div>
    </section>
  );
}
