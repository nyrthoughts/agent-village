import type { VillageAgentPlacement } from './types.js';
import type { Translate } from '../board/format.js';

const TOOL_MARKS: Record<string, string> = { codex: 'C', claude: 'A', openclaw: 'O', other: '•' };
const TOOL_LABELS: Record<string, string> = { codex: 'Codex', claude: 'Claude', openclaw: 'OpenClaw', other: 'Agent' };
const STATE_LABELS: Record<string, Parameters<Translate>[0]> = { working: 'En cours', waiting: 'En attente', idle: 'Sans activité récente', unknown: 'État non confirmé' };
const ROLE_LABELS: Record<string, Parameters<Translate>[0]> = { lead: 'Conversation principale', helper: 'Sous-agent', unknown: 'Rôle non confirmé' };

interface Props {
  agent: VillageAgentPlacement;
  t: Translate;
  onSelect: (sessionId: string) => void;
}

export function VillageAgent({ agent, t, onSelect }: Props) {
  const toolLabel = TOOL_LABELS[agent.tool] ?? 'Agent';
  const stateKey = STATE_LABELS[agent.state] ?? 'État non confirmé';
  const stateLabel = t(stateKey);
  return (
    <button
      type="button"
      className={`pixel-agent pixel-agent--${agent.tool} pixel-agent--${agent.state}`}
      data-session-id={agent.sessionId}
      data-project-id={agent.projectId}
      aria-label={`${toolLabel} · ${t(ROLE_LABELS[agent.role] ?? 'Rôle non confirmé')} · ${stateLabel} · ${agent.title}`}
      onClick={() => onSelect(agent.sessionId)}
    >
      <i className="pixel-agent__shadow" aria-hidden="true" />
      <i className="pixel-agent__head" aria-hidden="true"><b /></i>
      <i className="pixel-agent__body" aria-hidden="true" />
      <i className="pixel-agent__legs" aria-hidden="true" />
      <b className="pixel-agent__badge" aria-hidden="true">{TOOL_MARKS[agent.tool] ?? '•'}</b>
      {agent.state === 'waiting' && <em className="pixel-agent__bubble">…</em>}
      <span className="pixel-agent__label">
        <strong>{agent.title.slice(0, 40)}</strong>
        <small>{toolLabel} · {stateLabel}</small>
      </span>
    </button>
  );
}
