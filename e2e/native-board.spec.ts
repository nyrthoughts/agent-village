import { expect, test } from '@playwright/test';
import { projectId } from '../src/server/activity/projectObserver.js';
import type { BoardSnapshot } from '../src/shared/board.js';
import { fictionalSession, startNative } from './nativeHarness.js';

declare global { interface Window { __hookDom?: Record<string, number> } }

test('50 fictional hooks reach the DOM with p95 ≤ 2 s after server receipt', async ({ browser }) => {
  test.setTimeout(120_000);
  const native = await startNative(browser);
  try {
    const { bearer } = await native.enroll();
    const { page } = native;
    await expect(page.getByRole('heading', { name: 'Tableau des opérations' })).toBeVisible();
    await expect(page.getByText('Flux en direct')).toBeVisible();
    await page.mouse.move(1, 1); // Outside the reading area: nothing is frozen.
    await page.evaluate(() => {
      window.__hookDom = {};
      new MutationObserver(() => {
        for (const node of document.querySelectorAll<HTMLElement>('[data-anchor^="unmatched:claude:latency-"]')) {
          window.__hookDom![node.dataset.anchor!.slice('unmatched:'.length)] ??= Date.now();
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    // An independent reader of the same authenticated stream records each event's server receivedAt.
    const receivedAt = new Map<string, number>();
    const stream = await fetch(`${native.origin}/api/stream?after=0`, { headers: { authorization: `Bearer ${bearer}` } });
    const reader = stream.body!.getReader();
    const reading = (async () => {
      const decoder = new TextDecoder(); let buffer = '';
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true as const }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
          if (!block.includes('event: village')) continue;
          const event = JSON.parse(block.split('\n').find((line) => line.startsWith('data: '))!.slice(6)) as { sessionId?: string; receivedAt: string };
          if (event.sessionId && !receivedAt.has(event.sessionId)) receivedAt.set(event.sessionId, Date.parse(event.receivedAt));
        }
      }
    })();
    // Producers state an earlier occurrence time, so occurredAt/stateAt differs from server receipt.
    const producedAt = new Date(Date.now() - 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (let index = 0; index < 50; index++) {
      expect((await native.hook(`latency-${index}`, 'UserPromptSubmit', '/fictional/latency',
        { 'x-village-event-id': `latency-event-${String(index).padStart(4, '0')}`, 'x-village-occurred-at': producedAt })).status).toBe(202);
      await new Promise((done) => setTimeout(done, 25));
    }
    await expect.poll(() => page.evaluate(() => Object.keys(window.__hookDom ?? {}).length), { timeout: 15_000 }).toBe(50);
    await expect.poll(() => receivedAt.size, { timeout: 5_000 }).toBeGreaterThanOrEqual(50);
    await reader.cancel().catch(() => undefined);
    await reading;
    const rendered = await page.evaluate(() => window.__hookDom!);
    const board = await fetch(`${native.origin}/api/board`, { headers: { authorization: `Bearer ${bearer}` } }).then((response) => response.json()) as BoardSnapshot;
    expect(Date.parse(board.state.sessions['claude:latency-0']!.stateAt)).toBe(Date.parse(producedAt));
    // Browser and server share this machine's clock: DOM time minus the server receipt time.
    const latencies = Object.entries(rendered).map(([id, at]) => at - receivedAt.get(id)!).sort((a, b) => a - b);
    expect(latencies.every((latency) => Number.isFinite(latency) && latency >= 0)).toBe(true);
    const p95 = latencies[Math.ceil(latencies.length * 0.95) - 1]!;
    const instrumented = (await page.evaluate(() => window.__agentVillageRender?.samples ?? [])).map((sample) => sample.ms).sort((a, b) => a - b);
    const instrumentedP95 = instrumented[Math.ceil(instrumented.length * 0.95) - 1] ?? Number.NaN;
    test.info().annotations.push({ type: 'hook-to-dom-p95-ms', description: `${p95} (in-app ${instrumentedP95}, n=${latencies.length})` });
    console.log(`hook → DOM p95 ${p95} ms, max ${latencies.at(-1)} ms, in-app p95 ${instrumentedP95} ms, n=${latencies.length}`);
    expect(latencies).toHaveLength(50);
    expect(instrumented.length).toBeGreaterThanOrEqual(50);
    expect(p95).toBeLessThanOrEqual(2_000);
    await expect(page.locator('.source-bar__latency')).toContainText('p95');
    expect(await page.locator('main').innerText()).not.toContain('fictional private prompt');
    expect(native.collector.reads).toBeGreaterThan(0);
  } finally { await native.close(); }
});

test('reading stays stable: frozen list and detail, counted changes, anchored apply', async ({ browser }) => {
  test.setTimeout(90_000);
  const sessions = Array.from({ length: 6 }, (_, index) => fictionalSession({ id: `claude:fictional-${index}`, projectKey: `fictional-root-${index}`, project: `Project ${index}`,
    title: `Task ${index}`, history: Array.from({ length: 12 }, (_, entry) => ({ at: new Date(Date.now() - (120 - entry) * 60_000).toISOString(), kind: 'report' as const,
      text: `Report ${entry} for project ${index}.\nLine two of a fictional report.\nLine three of a fictional report.` })) }));
  const native = await startNative(browser, { sessions });
  try {
    await native.enroll();
    const { page } = native;
    await expect(page.locator('.project-row')).toHaveCount(6);
    const order = () => page.locator('.project-row').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-project-id')));
    const before = await order();
    const openId = projectId('fictional-root-2');
    await page.locator(`.project-row[data-project-id="${openId}"] .project-row__main`).click();
    await expect(page.getByRole('complementary')).toBeVisible();
    const column = page.locator('.board__detail');
    // The owner is reading the timeline: its newest entries are above the viewport.
    await page.locator('.detail__timeline .timeline li').nth(4).evaluate((node) => node.scrollIntoView({ block: 'start' }));
    const scrollBefore = await column.evaluate((node) => node.scrollTop);
    expect(scrollBefore).toBeGreaterThan(0);
    const anchor = await column.evaluate((node) => {
      const top = node.getBoundingClientRect().top;
      const element = [...node.querySelectorAll('[data-anchor]')].find((entry) => entry.getBoundingClientRect().bottom > top + 1)!;
      return { key: element.getAttribute('data-anchor')!, offset: element.getBoundingClientRect().top - top };
    });
    const entriesBefore = await page.locator('.detail__timeline .timeline li').count();
    // The owner selects a passage of the entry they are reading.
    const selected = await column.evaluate((node, key) => {
      const text = node.querySelector(`[data-anchor="${CSS.escape(key)}"] .timeline__text`)!;
      const range = document.createRange();
      range.selectNodeContents(text.firstChild!);
      const selection = window.getSelection()!;
      selection.removeAllRanges(); selection.addRange(range);
      return selection.toString();
    }, anchor.key);
    expect(selected.length).toBeGreaterThan(10);
    // Viewport position of what is being read, of the reading area, and the selected project.
    const positions = () => page.evaluate((key) => ({
      anchor: document.querySelector(`.board__detail [data-anchor="${CSS.escape(key)}"]`)!.getBoundingClientRect().top,
      reading: document.querySelector('.board__reading')!.getBoundingClientRect().top,
      selection: window.getSelection()!.toString(),
      open: document.querySelector('.project-row.is-open')?.getAttribute('data-project-id'),
      current: document.querySelector('.project-row__main[aria-current="true"]')?.closest('.project-row')?.getAttribute('data-project-id'),
    }), anchor.key);
    const reading = await positions();
    expect(reading).toMatchObject({ selection: selected, open: openId, current: openId });
    native.collector.sessions = native.collector.sessions.map((session, index) => index === 2
      ? { ...session, history: [...session.history, { at: new Date().toISOString(), kind: 'report', text: 'Fresh fictional report.' }] } : session);
    expect((await native.hook('fictional-5', 'Notification')).status).toBe(202);
    const apply = page.getByRole('button', { name: /changements — appliquer/ });
    // Wait for both the hook and the collected report (next 1-second poll) to be pending.
    await expect(apply).toHaveText(/^([2-9]|\d{2,}) changements/, { timeout: 10_000 });
    expect(await order()).toEqual(before);
    expect(await column.evaluate((node) => node.scrollTop)).toBe(scrollBefore);
    expect(await page.locator('.detail__timeline .timeline li').count()).toBe(entriesBefore);
    // The pending-changes button appeared without moving the text, the reading area or the selection.
    const frozen = await positions();
    expect(frozen.selection).toBe(selected);
    expect(frozen.open).toBe(openId);
    expect(frozen.current).toBe(openId);
    expect(Math.abs(frozen.anchor - reading.anchor)).toBeLessThanOrEqual(1);
    expect(Math.abs(frozen.reading - reading.reading)).toBeLessThanOrEqual(1);
    await apply.click();
    await expect(apply).toHaveCount(0);
    await expect(page.locator(`.project-row[data-project-id="${openId}"]`)).toHaveClass(/is-open/);
    await expect(page.locator('.detail__timeline .timeline__text', { hasText: 'Fresh fictional report.' })).toHaveCount(1);
    const after = await column.evaluate((node, key) => {
      const top = node.getBoundingClientRect().top;
      const element = [...node.querySelectorAll('[data-anchor]')].find((entry) => entry.getAttribute('data-anchor') === key)!;
      const fresh = [...node.querySelectorAll('.detail__timeline .timeline__text')].find((entry) => entry.textContent === 'Fresh fictional report.')!;
      return { offset: element.getBoundingClientRect().top - top, freshBottom: fresh.getBoundingClientRect().bottom - top };
    }, anchor.key);
    expect(Math.abs(after.offset - anchor.offset)).toBeLessThanOrEqual(2);
    expect(after.freshBottom).toBeLessThanOrEqual(0); // Inserted above the viewport, not under the reader.
  } finally { await native.close(); }
});

test('falls back to 5-second polling when the stream fails, and dates a failing source', async ({ browser }) => {
  test.setTimeout(90_000);
  const native = await startNative(browser);
  try {
    await native.page.route('**/api/stream*', (route) => route.abort());
    await native.enroll();
    const { page } = native;
    await expect(page.getByText('Reconnexion · sondage 5 s en attendant')).toBeVisible({ timeout: 15_000 });
    await page.mouse.move(1, 1);
    expect((await native.hook('polled-session')).status).toBe(202);
    await expect(page.locator('[data-anchor="unmatched:claude:polled-session"]')).toBeVisible({ timeout: 12_000 });
    // Live ages use the wall clock of the render: a just-polled signal is never "in N seconds".
    for (let check = 0; check < 3; check++) {
      await expect(page.locator('.source-bar')).not.toContainText(/dans \d+ seconde|in \d+ second/);
      await page.waitForTimeout(1_100);
    }
    native.collector.failing = true;
    const codex = page.locator('[data-source="codex"]');
    await expect(codex).toHaveAttribute('data-status', 'unreachable', { timeout: 15_000 });
    await expect(codex).toContainText('Inaccessible');
    await expect(codex.locator('time').last()).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
    await page.unroute('**/api/stream*');
    await expect(page.getByText('Flux en direct')).toBeVisible({ timeout: 45_000 });
  } finally { await native.close(); }
});
