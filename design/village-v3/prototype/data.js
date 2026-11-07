/* DEMO DATA. Nothing here comes from a real session, repo or API.
   Source statuses are display examples; real support must be verified before shipping. */
window.DEMO = {
  isDemo: true,
  syncedAt: '14:32',
  sources: [
    { id: 'cli', label: 'Claude Code CLI', status: 'supported' },
    { id: 'codex', label: 'Codex', status: 'supported' },
    { id: 'app', label: 'Claude app', status: 'unavailable' }
  ],
  projects: [
    { id: 'atlas', name: 'Atlas', sub: 'Knowledge graph', last: '1 min ago' },
    { id: 'privacy', name: 'Privacy Desk', sub: 'Compliance', last: '2 min ago' },
    { id: 'connector', name: 'Connector Lab', sub: 'Integrations', last: '1 min ago' },
    { id: 'warehouse', name: 'Warehouse', sub: 'Data models', last: '1 min ago' },
    { id: 'launch', name: 'Launch Studio', sub: 'Go-to-market', last: '4 min ago' }
  ],
  // state: working | idle | approval | input | error | offline
  // Display name = what the source calls the session: a folder, a task title or a first prompt, truncated.
  bots: {
    'graph-map': { last: '1 min', name: 'graph-map' },
    'entity-audit': { last: '4 min', name: 'Merge duplicate entities' },
    'privacy-guard': { last: '9 min', name: 'privacy-guard' },
    'redaction-check': { last: '2 min', name: 'redaction-check' },
    'partner-connector': { last: '1 min', name: 'partner-connector' },
    'tool-schema': { last: '6 min', name: 'tool-schema' },
    'release-notes': { last: '25 min', name: 'Write release notes for v0.4' },
    'model-refresh': { last: '3 min', name: 'model-refresh' },
    'segment-models': { last: '1 min', name: 'Rebuild segment models' },
    'warehouse-qa': { last: '12 min', name: 'warehouse' },
    'landing-review': { last: '4 min', name: 'landing-page' },
    'outreach-copy': { last: '41 min', name: 'Follow-up emails, round 2' },
    'claude-app': { last: 'no source', name: 'Claude app' }
  },
  asks: [
    { bot: 'tool-schema', type: 'error', text: 'Stopped: the tool schema fails validation.', age: '6 min', open: 'Open transcript' },
    { bot: 'model-refresh', type: 'approval', text: 'Run the full build in the sandbox?', age: '3 min', open: 'Open session' },
    { bot: 'privacy-guard', type: 'input', text: 'Which retention period applies to this account?', age: '9 min', open: 'Open session' },
    { bot: 'warehouse-qa', type: 'input', text: 'Backfill from January or only from July?', age: '12 min', open: 'Open session' },
    { bot: 'outreach-copy', type: 'input', text: 'Lead the trial follow-up with pricing or with the case study?', age: '41 min', open: 'Open task' }
  ],
  activity: [
    { t: '14:31', bot: 'segment-models', state: 'working', text: 'replied in its session' },
    { t: '14:29', bot: 'tool-schema', state: 'error', text: 'stopped on an error' },
    { t: '14:28', bot: 'model-refresh', state: 'approval', text: 'asked for your approval' },
    { t: '14:20', bot: 'warehouse-qa', state: 'input', text: 'asked you a question' }
  ],
  context: {
    warehouse: {
      goal: 'Recompute the addressable market from the segment models, without writing to production tables.',
      decisions: [
        ['Nov 3', 'Sandbox required before any write.'],
        ['Oct 29', 'Cost cap on every exploratory query.'],
        ['Oct 24', 'Shared models go through a reviewed PR.']
      ],
      repo: { name: 'demo-org/warehouse', branch: 'model-refresh' },
      tasks: [
        [false, 'Validate the sandbox build', 'you'],
        [false, 'Pick the backfill range', 'you'],
        [false, 'Compare 3 sample accounts', 'segment-models'],
        [true, 'Document the calculation method', 'model-refresh']
      ],
      artifacts: [['doc', 'method.md'], ['table', 'sample-check.csv'], ['link', 'Spec (doc)']]
    }
  }
};
