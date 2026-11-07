/* DONNÉES DE DÉMO. Rien ici ne vient d'une vraie session, d'un vrai repo ou d'une API.
   Les statuts de source sont des exemples d'affichage : le support réel reste à vérifier. */
window.DEMO = {
  isDemo: true,
  sources: [
    { id: 'cli',   label: 'Claude Code CLI', status: 'supporté' },
    { id: 'codex', label: 'Codex',           status: 'supporté' },
    { id: 'app',   label: 'App Claude',      status: 'indisponible' }
  ],
  projects: [
    { id: 'atlas',  name: 'Atlas',  sub: 'Graphe de connaissances',       at: [0, 0],  theme: 'library',    accent: '#9D8FD6', last: 'il y a 7 min' },
    { id: 'privacy', name: 'Privacy Desk', sub: 'Conformité',      at: [9, 0],  theme: 'vault',      accent: '#7FB59E', last: 'il y a 9 min' },
    { id: 'connector',  name: 'Connector Lab',   sub: 'Distribution',    at: [18, 0], theme: 'workshop',   accent: '#7E9CC9', last: 'il y a 2 min' },
    { id: 'warehouse',  name: 'Warehouse',   sub: 'Modèles de données',  at: [0, 8],  theme: 'datacenter', accent: '#C9A86A', last: 'il y a 3 min' },
    { id: 'launch',  name: 'Launch Studio',      sub: 'Go-to-market',    at: [9, 8],  theme: 'studio',     accent: '#C88AA8', last: 'il y a 14 min' },
    { id: 'new',  name: 'Emplacement libre', sub: 'Le prochain projet détecté s’installe ici', at: [18, 8], theme: 'lot', accent: '#536471', last: '' }
  ],
  bots: [
    { id: 'entity-audit',     project: 'atlas',  source: 'codex', state: 'approval', slot: 'a', last: '18 min' },
    { id: 'graph-map',     project: 'atlas',  source: 'cli',   state: 'working',  slot: 'b', last: '1 min' },
    { id: 'roadmap-chat',     project: 'atlas',  source: 'app',   state: 'offline',  slot: 'c', last: 'source indisponible' },
    { id: 'privacy-guard',       project: 'privacy', source: 'cli',   state: 'input',    slot: 'a', last: '9 min' },
    { id: 'redaction-check',  project: 'privacy', source: 'codex', state: 'working',  slot: 'b', last: '2 min' },
    { id: 'partner-connector',  project: 'connector',  source: 'cli',   state: 'working',  slot: 'a', last: '1 min' },
    { id: 'tool-schema',      project: 'connector',  source: 'cli',   state: 'error',    slot: 'b', last: '6 min' },
    { id: 'release-notes',project: 'connector',  source: 'codex', state: 'idle',     last: '25 min' },
    { id: 'model-refresh',      project: 'warehouse',  source: 'cli',   state: 'approval', slot: 'a', last: '3 min' },
    { id: 'segment-models',       project: 'warehouse',  source: 'codex', state: 'working',  slot: 'b', last: '1 min' },
    { id: 'warehouse-qa',     project: 'warehouse',  source: 'cli',   state: 'idle',     pos: [2.6, 3.7], seat: true, last: '32 min' },
    { id: 'landing-review',   project: 'launch',  source: 'cli',   state: 'working',  slot: 'a', last: '4 min' },
    { id: 'outreach-copy',    project: 'launch',  source: 'codex', state: 'input',    slot: 'b', last: '41 min' },
    { id: 'storyboard',       project: 'launch',  source: 'app',   state: 'offline',  slot: 'c', last: 'source indisponible' }
  ],
  walkers: [ { id: 'release-notes', at: [16.5, 4.2], path: [16.5, 4.2, 16.5, 9.5, 12.5, 6.5] } ],
  asks: [
    { bot: 'model-refresh',   type: 'approval', text: 'Lancer le build complet en sandbox ?',            age: '3 min',  open: 'Ouvrir la session' },
    { bot: 'tool-schema',   type: 'error',    text: 'Arrêt : le schéma d’outil ne passe pas la validation.', age: '6 min', open: 'Ouvrir le transcript' },
    { bot: 'privacy-guard',    type: 'input',    text: 'Quel délai de rétention pour ce compte ?',       age: '9 min',  open: 'Ouvrir la session' },
    { bot: 'entity-audit',  type: 'approval', text: 'Appliquer le renommage de 14 entités ?',          age: '18 min', open: 'Ouvrir la tâche' },
    { bot: 'outreach-copy', type: 'input',    text: 'Ton A ou ton B pour la séquence ?',               age: '41 min', open: 'Ouvrir la session' }
  ],
  activity: [
    { t: '14:31', bot: 'segment-models',      text: 'a répondu dans sa session' },
    { t: '14:29', bot: 'tool-schema',     text: 's’est arrêté sur une erreur' },
    { t: '14:28', bot: 'model-refresh',     text: 'demande ton approbation' }
  ],
  context: {
    warehouse: {
      goal: 'Recalculer le marché adressable à partir des modèles de segments, sans écrire dans les tables de prod.',
      decisions: [
        ['03 nov.', 'Sandbox obligatoire avant toute écriture.'],
        ['29 oct.', 'Plafond de coût sur chaque requête exploratoire.'],
        ['24 oct.', 'Les modèles partagés passent par une PR validée.']
      ],
      repo: { name: 'demo-org/warehouse', branch: 'model-refresh' },
      tasks: [
        [false, 'Valider le build sandbox', 'À toi'],
        [false, 'Comparer 3 comptes échantillons', 'segment-models'],
        [true,  'Documenter la méthode de calcul', 'model-refresh']
      ],
      artifacts: [['doc', 'method.md'], ['table', 'sample-check.csv'], ['link', 'Spec (doc)']]
    }
  }
};
