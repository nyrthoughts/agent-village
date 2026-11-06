import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCharacter, toolLabel } from './AgentCharacter.js';
import type { ObservedSession } from '../../shared/observation.js';

function makeSession(overrides: Partial<ObservedSession> = {}): ObservedSession {
  return {
    id: 'session-1',
    tool: 'codex',
    state: 'idle',
    lastActivityAt: new Date().toISOString(),
    projectKey: 'proj-1',
    history: [],
    title: 'Test session',
    ...overrides,
  };
}

describe('toolLabel', () => {
  it('maps codex', () => expect(toolLabel('codex')).toBe('Codex'));
  it('maps claude', () => expect(toolLabel('claude')).toBe('Claude'));
  it('maps openclaw', () => expect(toolLabel('openclaw')).toBe('OpenClaw'));
  it('maps other to Forge', () => expect(toolLabel('other')).toBe('Forge'));
});

describe('AgentCharacter', () => {
  it('renders a button with the tool class', () => {
    const { container } = render(<AgentCharacter session={makeSession({ tool: 'claude' })} />);
    const button = container.querySelector('button');
    expect(button?.classList.contains('agent-char--claude')).toBe(true);
  });

  it('includes accessible label', () => {
    render(<AgentCharacter session={makeSession({ tool: 'codex', title: 'My session' })} />);
    expect(screen.getByLabelText(/Codex · My session/)).toBeTruthy();
  });

  it('shows bubble when working', () => {
    const { container } = render(
      <AgentCharacter session={makeSession({ state: 'working', activityEvidence: { level: 'confirmed', source: 'codex-index', observedAt: new Date().toISOString() } })} />,
    );
    expect(container.querySelector('.agent-char__bubble')).toBeTruthy();
  });

  it('does not show bubble when idle', () => {
    const { container } = render(<AgentCharacter session={makeSession({ state: 'idle' })} />);
    expect(container.querySelector('.agent-char__bubble')).toBeNull();
  });
});
