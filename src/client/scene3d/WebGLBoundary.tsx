import { useState, type ReactNode } from 'react';

export function detectWebGL(): boolean {
  try {
    if (!('WebGLRenderingContext' in window)) return false;
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface WebGLBoundaryProps {
  children: (controls: { onUnavailable: () => void }) => ReactNode;
  fallback: ReactNode;
  isAvailable?: () => boolean;
}

export function WebGLBoundary({
  children,
  fallback,
  isAvailable = detectWebGL,
}: WebGLBoundaryProps) {
  const [available, setAvailable] = useState(isAvailable);
  if (!available) {
    return (
      <section className="webgl-fallback" data-testid="webgl-fallback">
        <p role="status">3D unavailable; showing accessible table.</p>
        {fallback}
      </section>
    );
  }
  return <>{children({ onUnavailable: () => setAvailable(false) })}</>;
}
