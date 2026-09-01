#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_EXTENSIONS = new Set([
  '', '.css', '.html', '.json', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);
const SKIPPED_DIRECTORIES = new Set([
  '.git', 'coverage', 'dist', 'logs', 'node_modules', 'playwright-report', 'test-results',
]);

// Encoded so the hygiene gate does not match its own denylist.
const FORBIDDEN_FRAGMENTS = [
  'TnlsYW4=',
  'UmljaGFyZA==',
  'RnVsbEVucmljaA==',
].map((value) => Buffer.from(value, 'base64').toString('utf8'));

async function collectTextFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      entry.isDirectory()
      && (SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith('node_modules'))
    ) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTextFiles(root, path));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

export async function checkClean(root) {
  const findings = [];
  for (const path of await collectTextFiles(root)) {
    const content = await readFile(path, 'utf8');
    for (const fragment of FORBIDDEN_FRAGMENTS) {
      if (content.toLowerCase().includes(fragment.toLowerCase())) {
        findings.push(`${path}: personal or company identifier`);
      }
    }
    if (/\/(?:Users|home)\/[^\s"']+/i.test(content) || /[A-Za-z]:\\Users\\[^\s"']+/i.test(content)) {
      findings.push(`${path}: absolute home path`);
    }
  }
  return findings;
}

async function main() {
  const rootFlag = process.argv.indexOf('--root');
  const requestedRoot = rootFlag >= 0 ? process.argv[rootFlag + 1] : process.cwd();
  if (!requestedRoot) throw new Error('--root requires a directory');
  const root = resolve(requestedRoot);
  const findings = await checkClean(root);
  if (findings.length > 0) {
    console.error(findings.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Clean public fixture.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
