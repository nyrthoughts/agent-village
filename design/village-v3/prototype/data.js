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
    { id: 'atlas', name: 'Atlas', sub: 'Knowledge graph', last: '7 min ago' },
    { id: 'privacy', name: 'Privacy Desk', sub: 'Compliance', last: '2 min ago' },
    { id: 'connector', name: 'Connector Lab', sub: 'Integrations', last: '1 min ago' },
    { id: 'warehouse', name: 'Warehouse', sub: 'Data models', last: '1 min ago' },
    { id: 'launch', name: 'Launch Studio', sub: 'Go-to-market', last: '4 min ago' }
  ],
  // state: working | idle | approval | input | error | offline
  bots: {
    'graph-map': { last: '1 min' },
    'entity-audit': { last: '18 min' },
    'roadmap-chat': { last: 'source unavailable' },
    'privacy-guard': { last: '9 min' },
    'redaction-check': { last: '2 min' },
    'partner-connector': { last: '1 min' },
    'tool-schema': { last: '6 min' },
    'release-notes': { last: '25 min' },
    'model-refresh': { last: '3 min' },
    'segment-models': { last: '1 min' },
    'warehouse-qa': { last: '32 min' },
    'landing-review': { last: '4 min' },
    'outreach-copy': { last: '41 min' },
    'storyboard': { last: 'source unavailable' }
  },
  asks: [
    { bot: 'tool-schema', type: 'error', text: 'Stopped: the tool schema fails validation.', age: '6 min', open: 'Open transcript' },
    { bot: 'model-refresh', type: 'approval', text: 'Run the full build in the sandbox?', age: '3 min', open: 'Open session' },
    { bot: 'entity-audit', type: 'approval', text: 'Apply the rename to 14 entities?', age: '18 min', open: 'Open task' },
    { bot: 'privacy-guard', type: 'input', text: 'Which retention period applies to this account?', age: '9 min', open: 'Open session' },
    { bot: 'outreach-copy', type: 'input', text: 'Tone A or tone B for the follow-up sequence?', age: '41 min', open: 'Open session' }
  ],
  activity: [
    { t: '14:31', bot: 'segment-models', state: 'working', text: 'replied in its session' },
    { t: '14:29', bot: 'tool-schema', state: 'error', text: 'stopped on an error' },
    { t: '14:28', bot: 'model-refresh', state: 'approval', text: 'asked for your approval' }
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
        [false, 'Compare 3 sample accounts', 'segment-models'],
        [true, 'Document the calculation method', 'model-refresh']
      ],
      artifacts: [['doc', 'method.md'], ['table', 'sample-check.csv'], ['link', 'Spec (doc)']]
    }
  }
};
