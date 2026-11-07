import { chmod, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MANIFEST_ERROR_PREFIX, manifestErrorMessage, parseProjectManifest, ProjectManifestFile } from './projectManifest.js';

const HOME = '/village-owner';
const VALID = `
projects:
  - name: Warehouse
    remotes: [github.com/demo-org/warehouse, "git@github.com:demo-org/warehouse-legacy.git"]
    paths: [~/code/monorepo/packages/warehouse]
    titles: ["^warehouse:"]
    sessions: [codex:abc123]
    links:
      - { title: Pricing brainstorm, url: "https://claude.ai/chat/00000000-demo", source: claude-app }
  - name: Notes
catchAll: [~, /tmp/**]
`;

describe('parseProjectManifest', () => {
  it('turns a valid manifest into resolver rules, declared projects and catch-all directories', () => {
    const result = parseProjectManifest(VALID, HOME);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const [warehouse, notes] = result.manifest.rules;
    expect(warehouse).toMatchObject({ name: 'Warehouse', sessions: ['codex:abc123'],
      remotes: ['github.com/demo-org/warehouse', 'github.com/demo-org/warehouse-legacy'], paths: [`${HOME}/code/monorepo/packages/warehouse`] });
    expect(warehouse?.titles[0]?.test('WAREHOUSE: recount')).toBe(true);
    expect(notes).toMatchObject({ sessions: [], remotes: [], paths: [], titles: [] });
    expect(result.manifest.catchAll).toEqual([HOME, '/tmp/**']);
    expect(result.manifest.declared).toEqual([
      { key: 'alias:Warehouse', name: 'Warehouse', links: [{ title: 'Pricing brainstorm', url: 'https://claude.ai/chat/00000000-demo', source: 'claude-app' }] },
      { key: 'alias:Notes', name: 'Notes', links: [] },
    ]);
  });

  it('accepts an empty file and leaves catch-all defaults to the caller', () => {
    expect(parseProjectManifest('', HOME)).toEqual({ ok: true, manifest: { rules: [], catchAll: undefined, declared: [] } });
  });

  it.each([
    ['projects:\n  - name: A\n    remotes: [/srv/git/a.git]', 'projects.0.remotes.0', 'not a recognised Git remote'],
    ['projects:\n  - name: A\n    titles: ["(unclosed"]', 'projects.0.titles.0', 'invalid regular expression'],
    ['projects:\n  - name: A\n    paths: [code/a]', 'projects.0.paths.0', 'absolute'],
    ['projects:\n  - name: A\n    sessions: [abc123]', 'projects.0.sessions.0', 'source:id'],
    ['projects:\n  - name: A\n    links: [{ title: X, url: "javascript:alert(1)" }]', 'projects.0.links.0.url', ''],
    ['projects:\n  - name: A\n    links: [{ title: X, url: "http://example.invalid/chat" }]', 'projects.0.links.0.url', 'https'],
    ['projects:\n  - name: A\n  - name: a', 'projects.1.name', 'duplicate'],
    ['projects:\n  - name: A\n    remote: [github.com/x/y]', 'projects.0', 'Unrecognized key'],
    ['project: []', '', 'Unrecognized key'],
    ['projects:\n  - { name: "" }', 'projects.0.name', ''],
    ['catchAll: [tmp]', 'catchAll.0', 'absolute'],
  ])('rejects %j at %s', (text, path, message) => {
    const result = parseProjectManifest(text, HOME);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path, message: expect.stringContaining(message) })]));
  });

  it('reports malformed YAML on one line', () => {
    const result = parseProjectManifest('projects: [', HOME);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.message).toMatch(/^malformed YAML/);
      expect(manifestErrorMessage(result.errors)).toMatch(new RegExp(`^${MANIFEST_ERROR_PREFIX}\\(root\\): malformed YAML`));
    }
  });
});

describe('ProjectManifestFile', () => {
  const directories: string[] = [];
  afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }); });
  const setup = async () => { const directory = await mkdtemp(join(tmpdir(), 'village-manifest-')); directories.push(directory); return directory; };

  it('treats a missing file as no manifest', async () => {
    expect(new ProjectManifestFile(join(await setup(), 'projects.yaml'), HOME).read()).toEqual({});
  });

  it('reads a private manifest, re-reads it after a change, and reports a bad version without throwing', async () => {
    const path = join(await setup(), 'projects.yaml');
    await writeFile(path, VALID, { mode: 0o600 });
    const file = new ProjectManifestFile(path, HOME);
    expect(file.read().manifest?.rules).toHaveLength(2);
    await writeFile(path, 'projects:\n  - name: A\n    sessions: [nope]\n');
    await utimes(path, new Date(), new Date(Date.now() + 5_000));
    const broken = file.read();
    expect(broken.manifest).toBeUndefined();
    expect(broken.error).toBe(`${MANIFEST_ERROR_PREFIX}projects.0.sessions.0: expected source:id, such as codex:abc123`);
  });

  it('refuses a manifest others can edit, and symbolic links', async () => {
    const directory = await setup();
    const path = join(directory, 'projects.yaml');
    await writeFile(path, VALID);
    await chmod(path, 0o666);
    expect(new ProjectManifestFile(path, HOME).read().error).toContain('chmod 600');
    const link = join(directory, 'linked.yaml');
    await chmod(path, 0o600);
    await symlink(path, link);
    expect(new ProjectManifestFile(link, HOME).read().error).toContain('symbolic links');
  });
});
