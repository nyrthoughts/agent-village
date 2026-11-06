import { useEffect, useState } from 'react';
import { planDraftSchema, type PlanDraft, type ProjectPlan } from '../shared/projectPlan.js';
import { ApiError, saveProjectPlan } from './api/client.js';
import { translate, type Language } from './language.js';
import './project-plan.css';

const emptyMilestone = () => ({ id: crypto.randomUUID(), title: '', validated: false, note: '' });

/** Existing private ledger: explicit goal, up to twelve milestones, validations with a note. */
export function ProjectPlanPanel({ projectId, plan: serverPlan, language, editable, startEditing = false }: {
  projectId: string; plan?: ProjectPlan; language: Language; editable: boolean; startEditing?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
  const date = (value: string) => new Date(value).toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const [saved, setSaved] = useState<ProjectPlan>();
  useEffect(() => {
    if (saved && (serverPlan?.revision ?? 0) >= saved.revision) setSaved(undefined);
  }, [serverPlan, saved]);
  const plan = saved && saved.revision > (serverPlan?.revision ?? 0) ? saved : serverPlan;
  const [draft, setDraft] = useState<PlanDraft>();
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'invalid' | 'conflict' | 'save'>();
  const count = plan?.milestones.filter((m) => m.validated).length ?? 0;
  const edit = () => {
    setDraft(plan ? { objective: plan.objective, milestones: plan.milestones.map(({ id, title, validated, note }) => ({ id, title, validated, note })) }
      : { objective: '', milestones: [emptyMilestone()] });
    setRevision(plan?.revision ?? 0); setError(undefined);
  };
  useEffect(() => { if (startEditing && editable) edit(); }, [startEditing, editable]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (index: number, patch: Partial<PlanDraft['milestones'][number]>) => setDraft((current) => current && ({ ...current, milestones: current.milestones.map((m, i) => i === index ? { ...m, ...patch } : m) }));
  const save = async () => {
    const parsed = planDraftSchema.safeParse(draft);
    if (!parsed.success) { setError('invalid'); return; }
    setSaving(true); setError(undefined);
    try { setSaved(await saveProjectPlan(projectId, parsed.data, revision)); setDraft(undefined); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 409 ? 'conflict' : 'save'); }
    finally { setSaving(false); }
  };
  return <section className="project-plan" aria-label={t('Objectif et jalons')}>
    <header><small>{t('OBJECTIF → JALONS')}</small><h3>{t('Objectif et jalons')}</h3></header>
    {!draft && <>
      {plan ? <>
        <p className="project-plan__goal">{plan.objective}</p>
        <div className="project-plan__progress"><strong>{t('{done}/{total} jalons validés', { done: count, total: plan.milestones.length })}</strong><span>{t('{count} restants', { count: plan.milestones.length - count })}</span></div>
        <ol className="project-plan__milestones">{plan.milestones.map((m) => <li key={m.id} data-validated={m.validated}>
          <span className="project-plan__check" aria-hidden="true">{m.validated ? '✓' : '·'}</span>
          <div><strong>{m.title}</strong>{m.note && <p>{m.note}</p>}{m.validated && m.validatedAt && <small>{t(m.validatedBy === 'local-check' ? 'Contrôle local' : 'Validé par vous')} · <time dateTime={m.validatedAt} title={m.validatedAt}>{date(m.validatedAt)}</time></small>}</div>
        </li>)}</ol>
      </> : <><p className="project-plan__goal">{t('Plan à définir')}</p><p>{t('Un objectif stable et quelques jalons explicites. Les conversations seules ne prouvent pas la progression.')}</p></>}
      {editable ? <button type="button" onClick={edit}>{t(plan ? 'Modifier les jalons' : 'Définir l’objectif')}</button> : <p className="project-plan__disclaimer">{t('Lecture seule dans ce mode.')}</p>}
      <p className="project-plan__disclaimer">{t('Validation explicite, pas estimation automatique. Plan privé sur cet ordinateur.')}</p>
    </>}
    {draft && <form noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={saving}>
        <label>{t('Objectif final du projet')}<textarea autoFocus maxLength={700} value={draft.objective} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} /></label>
        {draft.milestones.map((milestone, index) => <section key={milestone.id} className="project-plan__edit-milestone">
          <label>{t('Jalon {number}', { number: index + 1 })}<input maxLength={180} value={milestone.title} onChange={(event) => update(index, { title: event.target.value })} /></label>
          <label className="project-plan__validate"><input type="checkbox" checked={milestone.validated} onChange={(event) => update(index, { validated: event.target.checked })} />{t('Valider le jalon {number}', { number: index + 1 })}</label>
          <label>{t('Note de validation {number}', { number: index + 1 })}<input maxLength={500} value={milestone.note} required={milestone.validated} placeholder={t('Ce que vous avez vérifié, et où.')} onChange={(event) => update(index, { note: event.target.value })} /></label>
          {draft.milestones.length > 1 && <button type="button" className="project-plan__remove" aria-label={t('Retirer le jalon {number}', { number: index + 1 })} onClick={() => setDraft({ ...draft, milestones: draft.milestones.filter((_, i) => i !== index) })}>{t('Retirer')}</button>}
        </section>)}
        {draft.milestones.length < 12 && <button type="button" onClick={() => setDraft({ ...draft, milestones: [...draft.milestones, emptyMilestone()] })}>{t('Ajouter un jalon')}</button>}
        <p className="project-plan__disclaimer">{t('Cocher un jalon enregistre votre validation, pas une certification automatique des tests ou du déploiement.')}</p>
        <div className="project-plan__actions"><button type="submit">{t(saving ? 'Enregistrement…' : 'Enregistrer le plan')}</button><button type="button" onClick={() => { setDraft(undefined); setError(undefined); }}>{t('Annuler')}</button></div>
      </fieldset>
      {error && <p role="alert">{t(error === 'invalid' ? 'Renseignez l’objectif, chaque jalon et une note pour chaque validation.' : error === 'conflict' ? 'Le plan a changé ailleurs. Votre brouillon est conservé. Annulez puis rouvrez le plan pour repartir de la dernière version.' : 'Enregistrement impossible. Votre brouillon est conservé. Réessayez.')}</p>}
    </form>}
  </section>;
}
