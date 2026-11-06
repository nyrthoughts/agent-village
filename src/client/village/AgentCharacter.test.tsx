import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCharacter, toolLabel } from './AgentCharacter.js';
import type { ObservedSession } from '../../shared/observation.js';

function makeSession(overrides: Partial<ObservedSession> = {}): ObservedSession {
  return {
    id: 'session-1', tool: 'codex', state: 'idle',
    lastActivityAt: new Date().toISOString(), projectKey: 'proj-1',
    history: [], title: 'Test session', ...overrides,
  };
}

describe('toolLabel', () => {
  it('maps codex', () => expect(toolLabel('codex')).toBe('Codex'));
  it('maps claude', () => expect(toolLabel('claude')).toBe('Claude'));
  it('maps openclaw', () => expect(toolLabel('openclaw')).toBe('OpenClaw'));
  it('maps other to Forge', () => expect(toolLabel('other')).toBe('Forge'));
  it('maps claude-code', () => expect(toolLabel('claude-code')).toBe('Claude Code'));
});

describe('AgentCharacter', () => {
  it('renders a button with raster bot class', () => {
    const { container } = render(<AgentCharacter session={makeSession({ tool: 'claude' })} />);
    const button = container.querySelector('button');
    expect(button?.classList.contains('raster-bot')).toBe(true);
  });

  it('uses the correct sprite src for codex', () => {
    const { container } = render(<AgentCharacter session={makeSession({ tool: 'codex' })} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/sprites/bot-codex-idle.png');
  });

  it('uses walk sprite when working with confirmed evidence', () => {
    const { container } = render(<AgentCharacter session={makeSession({
      tool: 'codex', state: 'working',
      activityEvidence: { level: 'confirmed', source: 'codex-index', observedAt: new Date().toISOString() },
    })} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/sprites/bot-codex-walk.png');
  });

  it('includes accessible label', () => {
    const { container } = render(<AgentCharacter session={makeSession({ tool: 'codex', title: 'My session' })} />);
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-label')).toContain('Codex');
    expect(button?.getAttribute('aria-label')).toContain('My session');
  });
});
