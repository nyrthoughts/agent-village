import type { DerivedTask, DerivedWorkspace } from '../../server/truth/derive.js';
import type { ActivitySnapshot } from '../../shared/activity.js';

interface VillageSummaryProps { village: DerivedWorkspace; activity?: ActivitySnapshot }

function tasks(village: DerivedWorkspace): DerivedTask[] {
  return village.projects.flatMap((project) => [
    ...project.features.flatMap((feature) => feature.tasks),
    ...project.tasks,
  ]);
}

export function VillageSummary({ village, activity }: VillageSummaryProps) {
  const allTasks = tasks(village);
  const verified = allTasks.filter(({ effectiveStatus }) => effectiveStatus === 'verified').length;
  const attention = allTasks.filter(({ effectiveStatus }) => effectiveStatus === 'blocked' || effectiveStatus === 'awaiting_review').length;
  const active = activity?.workers.filter(({ state }) => state === 'working').length ?? 0;
  const percent = allTasks.length === 0 ? 0 : Math.round(verified / allTasks.length * 100);
  return (
    <section className="village-summary" aria-label="Village progress">
      <div className="village-summary__progress">
        <span>Village progress</span><strong>{verified} / {allTasks.length}</strong><small>{percent}% built</small>
        <i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i>
      </div>
      <div><span>Agents on site</span><strong>{active} active</strong><small>{activity?.workers.length ?? 0} visible conversations</small></div>
      <div><span>Decision queue</span><strong>{attention} need attention</strong><small>Blocked or awaiting review</small></div>
    </section>
  );
}
