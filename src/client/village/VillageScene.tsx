import type { DerivedWorkspace } from '../../server/truth/derive.js';
import type { ObservedSession } from '../../shared/observation.js';
import type { Language } from '../language.js';
import { ProjectBuilding } from './ProjectBuilding.js';

const CLUSTER_POSITIONS: Array<{ left: string; top: string }> = [
  { left: '6%', top: '5%' },
  { left: '52%', top: '2%' },
  { left: '2%', top: '48%' },
  { left: '55%', top: '42%' },
  { left: '28%', top: '22%' },
  { left: '75%', top: '25%' },
  { left: '20%', top: '60%' },
  { left: '68%', top: '62%' },
];

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
        {/* Ground plane with subtle grid and glow */}
        <div className="iso-ground" />
        <div className="iso-grid" />

        {/* Isometric paths connecting clusters */}
        <svg className="iso-paths" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="pathGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(29,155,240,0.15)" />
              <stop offset="50%" stopColor="rgba(29,155,240,0.08)" />
              <stop offset="100%" stopColor="rgba(29,155,240,0.15)" />
            </linearGradient>
          </defs>
          {/* Horizontal paths */}
          <path d="M120 180 Q300 160 520 140" stroke="url(#pathGlow)" strokeWidth="6" fill="none" opacity="0.7" />
          <path d="M100 420 Q350 380 560 350" stroke="url(#pathGlow)" strokeWidth="6" fill="none" opacity="0.6" />
          {/* Vertical paths */}
          <path d="M180 200 Q160 320 150 400" stroke="url(#pathGlow)" strokeWidth="5" fill="none" opacity="0.5" />
          <path d="M600 170 Q580 280 580 370" stroke="url(#pathGlow)" strokeWidth="5" fill="none" opacity="0.5" />
          {/* Cross paths */}
          <path d="M320 240 Q400 300 500 280" stroke="url(#pathGlow)" strokeWidth="4" fill="none" opacity="0.4" />
          <path d="M250 480 Q400 460 620 480" stroke="url(#pathGlow)" strokeWidth="4" fill="none" opacity="0.4" />
        </svg>

        {/* Landscaping: subtle glowing dots as ground lights */}
        <div className="iso-landscape" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className="iso-landscape__light"
              style={{
                left: `${8 + (i * 37 + i * i * 7) % 84}%`,
                top: `${12 + (i * 43 + i * 11) % 76}%`,
                animationDelay: `${(i * 0.7) % 4}s`,
              }}
            />
          ))}
        </div>

        {/* Project buildings */}
        {projects.map((project, i) => {
          const pos = CLUSTER_POSITIONS[i % CLUSTER_POSITIONS.length]!;
          return (
            <ProjectBuilding
              key={project.id}
              project={project}
              language={language}
              now={now}
              onSelectSession={onSelectSession}
              style={{ position: 'absolute', left: pos.left, top: pos.top }}
            />
          );
        })}
      </div>
    </section>
  );
}
