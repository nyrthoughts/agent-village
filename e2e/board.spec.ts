import { expect, test } from '@playwright/test';

test.describe('fictional six-project board', () => {
  test('answers “where do I intervene?” from the first screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tableau des opérations' })).toBeVisible();
    await expect(page.getByRole('note')).toContainText('Données fictives');
    const rows = page.locator('.project-row');
    await expect(rows).toHaveCount(6);
    const attention = page.getByRole('region', { name: /À toi/ });
    // Type order: contradictions first, then decisions, replies and validations.
    const types = await attention.locator('[data-attention-type]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-attention-type')));
    expect(types.length).toBeGreaterThanOrEqual(5);
    const order = ['contradiction', 'decision', 'reply', 'validation'];
    expect(types.map((type) => order.indexOf(type!))).toEqual([...types.map((type) => order.indexOf(type!))].sort((a, b) => a - b));
    await expect(attention.getByText('Succès déclaré sur un commit cité, CI en échec sur ce commit')).toBeVisible();
    await expect(attention.getByText('Déclarations opposées entre sessions')).toBeVisible();
    await expect(attention.getByText('Notification de l’agent (autorisation ou saisie demandée)')).toBeVisible();
    // Factual wording: a report is something to read, never a reply the owner owes.
    await expect(attention.getByText('Compte rendu à lire')).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(/en attente de ta réponse|Attend une réponse/);
    await expect(page.getByRole('region', { name: 'Depuis ta dernière visite' })).toContainText('Dernières 24 h');
    await expect(page.getByRole('region', { name: /Non rattachés/ })).toContainText('scratch-notes');
    // No percentage, no ETA anywhere on the board.
    expect(await page.locator('main').innerText()).not.toMatch(/\d\s?%/);
    await expect(page.locator('progress')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'output/playwright/board-desktop.png' });
    await page.locator('.project-row', { hasText: 'Orchard Atlas' }).locator('.project-row__main').click();
    await page.screenshot({ path: 'output/playwright/board-detail.png' });
  });

  test('shows dated, distinct proofs: unlit is “not observed”, failure is distinct, CI on another commit is labelled', async ({ page }) => {
    await page.goto('/');
    const orchard = page.locator('.project-row', { hasText: 'Orchard Atlas' });
    await expect(orchard.locator('.ladder__dot--failed')).toHaveCount(1);
    await expect(orchard.locator('.ladder__dot--absent')).toHaveCount(2);
    const harbor = page.locator('.project-row', { hasText: 'Harbor Sync' });
    await expect(harbor.locator('.ladder__dot--other-sha')).toHaveCount(1);
    const meadow = page.locator('.project-row', { hasText: 'Meadow Docs' });
    await expect(meadow.locator('.ladder__dot--observed')).toHaveCount(6);
    await expect(meadow).toContainText('2/2 jalons validés');
  });

  test('keyboard: j/k move, Enter opens the side detail with the list still visible, Escape closes', async ({ page }) => {
    await page.goto('/');
    await page.locator('h1').click();
    await page.keyboard.press('j');
    const first = page.locator('.project-row').first();
    await expect(first.locator('.project-row__main')).toBeFocused();
    await page.keyboard.press('j');
    const second = page.locator('.project-row').nth(1);
    await expect(second.locator('.project-row__main')).toBeFocused();
    await page.keyboard.press('k');
    await expect(first.locator('.project-row__main')).toBeFocused();
    await page.keyboard.press('Enter');
    const detail = page.getByRole('complementary');
    await expect(detail).toBeVisible();
    await expect(page.locator('.project-row')).toHaveCount(6);
    await expect(detail.getByRole('region', { name: 'Échelle de preuves' })).toBeVisible();
    await expect(detail.getByRole('region', { name: 'Chronologie sourcée' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(first.locator('.project-row__main')).toBeFocused();
  });

  test('opens the source conversation and offers a copy-only resume command', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-row', { hasText: 'Beacon Relay' }).locator('.project-row__main').click();
    const detail = page.getByRole('complementary');
    await expect(detail.getByText('codex resume demo-br-1')).toBeVisible();
    await detail.getByRole('button', { name: 'Ouvrir la conversation' }).click();
    await expect(detail.getByRole('region', { name: 'Conversation d’origine' })).toContainText('Should I also add metrics');
    await detail.getByRole('button', { name: /Retour aux conversations/ }).click();
    await expect(detail.getByRole('region', { name: 'Agents et sessions' })).toBeVisible();
  });

  test('marks attention seen and snoozes with identifiers only in storage', async ({ page }) => {
    await page.goto('/');
    const attention = page.getByRole('region', { name: /À toi/ });
    const before = await attention.locator('[data-attention-type]').count();
    await attention.locator('[data-attention-type]').first().getByRole('button', { name: 'Marquer vu' }).click();
    await page.mouse.move(0, 0);
    await expect(attention.locator('[data-attention-type]')).toHaveCount(before - 1);
    await attention.locator('[data-attention-type]').first().getByRole('button', { name: 'Reporter 1 h' }).click();
    await expect(attention.locator('[data-attention-type]')).toHaveCount(before - 2);
    await expect(attention.getByText('2 masqués (vus ou reportés)')).toBeVisible();
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
    // Identifiers and timestamps only: no quote, title or project display name.
    expect(stored).not.toMatch(/tests pass|Should I|Integration|Orchard Atlas|Harbor Sync|Tile cache/);
    await page.getByRole('button', { name: 'Tout marquer vu' }).click();
    await expect(page.getByRole('region', { name: 'Depuis ta dernière visite' })).toContainText('Rien de nouveau.');
    await page.reload();
    await expect(attention.locator('[data-attention-type]')).toHaveCount(before - 2);
    await expect(page.getByRole('region', { name: 'Depuis ta dernière visite' })).toContainText('Rien de nouveau.');
  });

  test('switches language and keeps the choice', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Langue / Language' }).selectOption('en');
    await expect(page.getByRole('heading', { name: 'Operations board' })).toBeVisible();
    await expect(page.getByRole('region', { name: /For you/ })).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Operations board' })).toBeVisible();
  });

  test('390 px layout keeps the three zones in order without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const tops = await Promise.all(['À toi', 'Depuis ta dernière visite', 'Projets'].map((name) =>
      page.getByRole('heading', { name: new RegExp(`^${name}`) }).evaluate((node) => node.getBoundingClientRect().top)));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.project-row__main').first().click();
    await expect(page.getByRole('button', { name: 'Fermer le détail' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('reduced motion removes the row highlight animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const row = page.locator('.project-row').first();
    await row.evaluate((node) => node.classList.add('is-fresh'));
    expect(await row.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await row.evaluate((node) => getComputedStyle(node).animationName)).toBe('board-fresh');
    expect(await row.evaluate((node) => parseFloat(getComputedStyle(node).animationDuration))).toBeLessThanOrEqual(1.5);
  });
});
