import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebGLBoundary } from './WebGLBoundary.js';

afterEach(cleanup);

describe('WebGLBoundary', () => {
  it('shows the scene when WebGL is available and switches to the accessible fallback', () => {
    render(<WebGLBoundary
      isAvailable={() => true}
      fallback={<div>Accessible table</div>}
    >
      {({ onUnavailable }) => <button onClick={onUnavailable}>3D scene</button>}
    </WebGLBoundary>);

    fireEvent.click(screen.getByRole('button', { name: '3D scene' }));
    expect(screen.getByText('3D unavailable; showing accessible table.')).toBeTruthy();
    expect(screen.getByText('Accessible table')).toBeTruthy();
  });

  it('does not attempt scene initialization when WebGL is missing', () => {
    const renderScene = vi.fn(() => <div>3D scene</div>);
    render(<WebGLBoundary isAvailable={() => false} fallback={<div>Accessible table</div>}>
      {renderScene}
    </WebGLBoundary>);

    expect(renderScene).not.toHaveBeenCalled();
    expect(screen.getByText('Accessible table')).toBeTruthy();
  });
});
