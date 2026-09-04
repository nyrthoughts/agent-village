import { useEffect, useRef } from 'react';
import type { Worker } from '../../shared/activity.js';

interface WorkerDrawerProps {
  worker: Worker;
  helperCount?: number;
  trigger: HTMLButtonElement;
  onClose: () => void;
}

const ROLE_LABELS = {
  lead: 'Lead agent',
  helper: 'Helper agent',
  unknown: 'Agent role unavailable',
} as const;

export function WorkerDrawer({ worker, helperCount = 0, trigger, onClose }: WorkerDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); trigger.focus(); };
  }, [onClose, trigger]);

  const role = worker.role ?? 'unknown';
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="worker-drawer-title" data-ui-style="field-menu">
        <header className="detail-drawer__header">
          <div><span>{worker.tool} / field agent</span><h2 id="worker-drawer-title">{worker.title ?? 'Untitled conversation'}</h2></div>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose} aria-label="Close agent details">×</button>
        </header>
        <div className="detail-drawer__body">
          <dl className="drawer-facts">
            <div><dt>Role</dt><dd>{ROLE_LABELS[role]}</dd></div>
            <div><dt>State</dt><dd>{worker.state}</dd></div>
            <div><dt>Helpers</dt><dd>{helperCount} {helperCount === 1 ? 'helper' : 'helpers'}</dd></div>
            <div><dt>Project</dt><dd>{worker.project ?? 'Unavailable'}</dd></div>
            <div><dt>Task link</dt><dd>{worker.attachedTaskId ?? 'Unavailable'}</dd></div>
            <div><dt>Observed since</dt><dd>{worker.firstSeenAt ?? 'Unavailable'}</dd></div>
            <div><dt>Last activity</dt><dd>{worker.lastActivityAt}</dd></div>
            <div><dt>Active time</dt><dd>Unavailable</dd></div>
            <div><dt>Token usage</dt><dd>Unavailable</dd></div>
          </dl>
          <p className="drawer-data-note">Unavailable means the connected provider does not expose this value. Agent Village never estimates it.</p>
        </div>
      </aside>
    </div>
  );
}
