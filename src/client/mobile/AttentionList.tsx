import type { DerivedProject, DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import { sortByAttention } from '../../shared/attention.js';

interface AttentionListProps {
  village: DerivedWorkspace;
  onSelect: (task: DerivedTask, trigger: HTMLButtonElement, project: DerivedProject) => void;
}

export function AttentionList({ village, onSelect }: AttentionListProps) {
  const records = village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks.map((task) => ({ ...task, project }))),
    ...project.tasks.map((task) => ({ ...task, project })),
  ]);
  const ordered = sortByAttention(records);
  const urgent = ordered.filter((record) => record.effectiveStatus === 'blocked' || record.effectiveStatus === 'awaiting_review');
  const active = ordered.filter((record) => record.effectiveStatus === 'in_progress');
  const renderRecord = (record: (typeof records)[number]) => <li key={record.id}><button type="button" onClick={(event) => onSelect(record, event.currentTarget, record.project)}><span className={`attention-dot attention-dot--${record.effectiveStatus}`} /><span><strong>{record.title}</strong><small>{record.project.name} · {record.owner ?? 'Unassigned'}</small></span><em>{record.effectiveStatus.replace('_', ' ')}</em></button></li>;
  return (
    <section className="attention-list" aria-labelledby="attention-title">
      <div className="attention-list__heading"><span>Mobile field view</span><h2 id="attention-title">Needs attention</h2></div>
      <ol>{urgent.map(renderRecord)}</ol>
      {active.length > 0 && <><h3 className="attention-list__subheading">In progress</h3><ol>{active.map(renderRecord)}</ol></>}
    </section>
  );
}
