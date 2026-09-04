import { useEffect, useRef } from 'react';
import type { DerivedProject, DerivedTask } from '../../server/truth/derive.js';
import type { Worker } from '../../shared/activity.js';

interface DetailDrawerProps {
  task: DerivedTask;
  project: DerivedProject;
  trigger: HTMLButtonElement;
  workers?: readonly Worker[];
  onClose: () => void;
}

export function DetailDrawer({ task, project, trigger, workers = [], onClose }: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); trigger.focus(); };
  }, [onClose, trigger]);

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" data-ui-style="field-menu">
        <header className="detail-drawer__header">
          <div><span>{project.name} / construction file</span><h2 id="drawer-title">{task.title}</h2></div>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose} aria-label="Close details">×</button>
        </header>
        <div className="detail-drawer__body">
          <section><span className="drawer-label">Objective</span><p>{project.objective}</p></section>
          <dl className="drawer-facts">
            <div><dt>Status</dt><dd>{task.effectiveStatus.replace('_', ' ')}</dd></div>
            <div><dt>Owner</dt><dd>{task.owner ?? 'Unassigned'}</dd></div>
            <div><dt>Construction</dt><dd>{task.progress.stage}</dd></div>
            <div><dt>Progress</dt><dd>{task.progress.verified} / {task.progress.total} verified</dd></div>
            <div><dt>Work remaining</dt><dd>{task.progress.remaining} remaining</dd></div>
            <div><dt>Agents</dt><dd>{workers.length} connected</dd></div>
            <div><dt>Active time</dt><dd>Unavailable</dd></div>
            <div><dt>Token usage</dt><dd>Unavailable</dd></div>
          </dl>
          {task.blockedReason && <section className="drawer-callout drawer-callout--blocked"><span className="drawer-label">Blocker</span><p>{task.blockedReason}</p></section>}
          <section><span className="drawer-label">Next action</span><p>{task.nextAction ?? 'Define the next concrete action.'}</p></section>
          <section><span className="drawer-label">Conversation to resume</span><code>{task.resumeHint ?? 'No resume hint recorded.'}</code></section>
          <section>
            <span className="drawer-label">Inspection record</span>
            {(task.evidence?.length ?? 0) === 0 ? <p>No evidence attached.</p> : <ul className="evidence-list">{task.evidence?.map((evidence, index) => <li key={`${evidence.type}-${index}`}><strong>{evidence.type.replaceAll('_', ' ')}</strong><span>{evidence.verdict.replaceAll('_', ' ')}</span>{evidence.note && <small>{evidence.note}</small>}</li>)}</ul>}
            {task.warnings.length > 0 && <p className="drawer-warning">{task.warnings.map((warning) => warning.replaceAll('_', ' ')).join(' · ')}</p>}
          </section>
        </div>
      </aside>
    </div>
  );
}
