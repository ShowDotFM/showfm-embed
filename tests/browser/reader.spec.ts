/**
 * The player's transcript reader (`transcript="reader"`, frames 2d and 2e of
 * the listen page design) in Chromium, against the built v1.js and its
 * transcript chunk.
 *
 * - The layout at a phone's width and a desktop's: close and titles, the
 *   compact player, search and the text, nothing spilling, a screenshot of
 *   each in test-results/.
 * - One <audio> on the page, playing on through open and close.
 * - A modal dialog: Escape and Close close it, focus stays in it and goes
 *   back to what opened it, and the page behind does not scroll.
 * - `openTranscript()` and `showfm:transcript-close` for a page's own button.
 * - Speaker photos, initials without one, and `speaker-photos="off"`.
 */
import { expect, test, type Page } from '@playwright/test';
import { MAYA_PHOTO, TRANSCRIPT_EPISODE_ID, conversationVtt } from '../fixtures/transcript';
import { expectNoAxeViolations } from './axe';
import { API_ORIGIN, serveTranscript } from './transcript-harness';

const player = (attributes = '') =>
	`<showfm-player id="player" episode="${TRANSCRIPT_EPISODE_ID}" api="${API_ORIGIN}" transcript="reader" ${attributes}></showfm-player>`;

/** The reader's dialog, its header and its transcript, inside the player. */
const dialog = (page: Page) => page.locator('showfm-player dialog');

async function readerReady(page: Page) {
	await page.waitForFunction(
		() =>
			!!document
				.querySelector('showfm-player')
				?.shadowRoot?.querySelector('dialog[open] .rd-tr')
				?.shadowRoot?.querySelector('.line')
	);
}

/** Boxes of the reader's parts, by name, in the viewport's coordinates. */
function layout(page: Page) {
	return page.locator('showfm-player').evaluate((host) => {
		const root = host.shadowRoot!;
		const head = root.querySelector('.rd-head')!.shadowRoot!;
		const tr = root.querySelector('.rd-tr')!.shadowRoot!;
		const box = (element: Element | null) => {
			const rect = element!.getBoundingClientRect();
			return {
				top: Math.round(rect.top),
				bottom: Math.round(rect.bottom),
				left: Math.round(rect.left),
				right: Math.round(rect.right)
			};
		};
		return {
			dialog: box(root.querySelector('dialog')),
			close: box(head.querySelector('.rd-close')),
			titles: box(head.querySelector('.rd-titles')),
			player: box(root.querySelector('dialog .body')),
			search: box(tr.querySelector('.find')),
			text: box(tr.querySelector('.scroll')),
			page: {
				scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth
			}
		};
	});
}

for (const [name, width, height] of [
	['phone', 390, 780],
	['desktop', 1100, 800]
] as const) {
	test(`${name}: the reader lays out as its frame, filling the window`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await serveTranscript(page, player(), { width: width - 32 });
		await page.getByRole('button', { name: 'Transcript' }).click();
		await readerReady(page);
		await expect(dialog(page)).toHaveJSProperty('open', true);
		const parts = await layout(page);
		expect(parts.dialog).toEqual({ top: 0, left: 0, right: width, bottom: height });
		if (name === 'phone') {
			// 2d: close and titles, then the player, then search, then the text.
			expect(parts.close.left).toBeLessThan(parts.titles.left);
			expect(parts.player.top).toBeGreaterThanOrEqual(parts.close.bottom);
			expect(parts.search.top).toBeGreaterThanOrEqual(parts.player.bottom);
			expect(parts.text.top).toBeGreaterThanOrEqual(parts.search.bottom);
		} else {
			// 2e: titles, search and close in a row, then the player, then the text.
			expect(parts.titles.right).toBeLessThanOrEqual(parts.search.left);
			expect(parts.search.right).toBeLessThanOrEqual(parts.close.left);
			expect(Math.abs(parts.search.top - parts.close.top)).toBeLessThan(10);
			expect(parts.player.top).toBeGreaterThanOrEqual(parts.close.bottom);
			expect(parts.text.top).toBeGreaterThanOrEqual(parts.player.bottom);
		}
		// The text fills the rest of the window, and nothing spills sideways.
		expect(parts.text.bottom).toBe(height);
		expect(parts.page.scrolls).toBe(false);
		for (const part of [parts.close, parts.titles, parts.player, parts.search, parts.text]) {
			expect(part.left).toBeGreaterThanOrEqual(0);
			expect(part.right).toBeLessThanOrEqual(width);
		}
		await page.screenshot({ path: `test-results/reader-${name}.png` });
	});
}

/** The audio elements on the page, inside every shadow root. */
const audios = (page: Page) =>
	page.evaluate(() => {
		const found: HTMLAudioElement[] = [];
		const walk = (root: Document | ShadowRoot) => {
			found.push(...root.querySelectorAll('audio'));
			for (const element of root.querySelectorAll('*'))
				if (element.shadowRoot) walk(element.shadowRoot);
		};
		walk(document);
		return found.map((audio) => ({
			paused: audio.paused,
			time: audio.currentTime,
			marked: (audio as HTMLAudioElement & { marked?: boolean }).marked === true
		}));
	});

/** The focused element, inside any shadow roots, described by tag, class and name. */
const focused = (page: Page) =>
	page.evaluate(() => {
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		if (!active || active === document.body) return 'body';
		return `${active.localName}${active.id ? `#${active.id}` : ''}${
			active.className && typeof active.className === 'string'
				? `.${active.className.split(' ')[0]}`
				: ''
		}:${active.getAttribute('aria-label') ?? active.textContent?.trim() ?? ''}`;
	});

/** Whether the focused element is inside the reader's dialog (through shadow roots). */
const focusInReader = (page: Page) =>
	page.evaluate(() => {
		let active = document.activeElement;
		while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
		for (let node: Node | null = active; node;) {
			if (node instanceof HTMLDialogElement) return true;
			node = node.parentNode ?? (node as ShadowRoot).host ?? null;
		}
		return false;
	});

const readerTranscript = (page: Page) => page.locator('showfm-player').locator('dialog .rd-tr');

test('one audio, playing on through open and close; focus goes back to the button', async ({
	page
}) => {
	await serveTranscript(page, player());
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await audios(page))[0]?.time ?? 0).toBeGreaterThan(0.2);
	await page
		.locator('showfm-player')
		.evaluate(
			(host) =>
				((
					host.shadowRoot!.querySelector('audio') as HTMLAudioElement & { marked?: boolean }
				).marked = true)
		);
	const button = page.getByRole('button', { name: 'Transcript' });
	await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
	await expect(button).not.toHaveAttribute('aria-expanded');
	await button.click();
	await readerReady(page);
	// The same element, still playing, and the only one.
	let now = await audios(page);
	expect(now).toHaveLength(1);
	expect(now[0]).toMatchObject({ paused: false, marked: true });
	const before = now[0].time;
	await expect.poll(async () => (await audios(page))[0].time).toBeGreaterThan(before + 0.2);
	// The reader opens on its Close button.
	expect(await focused(page)).toBe('button.rd-close:Close transcript');
	// The compact player in the reader pauses and plays the same audio.
	await dialog(page).getByRole('button', { name: 'Pause' }).click();
	await expect.poll(async () => (await audios(page))[0].paused).toBe(true);
	await dialog(page).getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await audios(page))[0].paused).toBe(false);
	await page.getByRole('button', { name: 'Close transcript' }).click();
	await expect(dialog(page)).toHaveCount(0);
	now = await audios(page);
	expect(now).toHaveLength(1);
	expect(now[0]).toMatchObject({ paused: false, marked: true });
	// Back to the player's own Transcript button (a new one: the body moved).
	expect(await focused(page)).toBe('button.rate-btn:Transcript');
	// The standard player is back where it was.
	await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
});

test('Escape clears a search first, then closes; focus stays in the reader', async ({ page }) => {
	await serveTranscript(page, `<a id="outside" href="#outside">Outside</a>${player()}`);
	await page.getByRole('button', { name: 'Transcript' }).click();
	await readerReady(page);
	// A modal dialog: Tab past the last control leaves for the browser's own
	// controls (the body, here), never for the page behind.
	let inside = 0;
	for (let i = 0; i < 30; i++) {
		await page.keyboard.press('Tab');
		if (await focusInReader(page)) inside++;
		else expect(await focused(page)).toBe('body');
	}
	expect(inside).toBeGreaterThan(20);
	const search = page.getByRole('searchbox', { name: 'Search transcript' });
	await search.fill('bread');
	await expect(readerTranscript(page).getByText(/\d+ of \d+/)).toBeVisible();
	await search.press('Escape');
	await expect(search).toHaveValue('');
	await expect(dialog(page)).toHaveJSProperty('open', true);
	await search.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
	expect(await focused(page)).toBe('button.rate-btn:Transcript');
});

test('the page behind holds still while the reader is open', async ({ page }) => {
	await page.setViewportSize({ width: 800, height: 700 });
	await serveTranscript(
		page,
		`<div style="height:400px"></div>${player()}<div style="height:3000px"></div>`
	);
	await page.evaluate(() => window.scrollTo(0, 300));
	await page.getByRole('button', { name: 'Transcript' }).click();
	await readerReady(page);
	expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');
	// The text scrolls; the page does not.
	await page.mouse.move(400, 500);
	await page.mouse.wheel(0, 4000);
	await expect
		.poll(() =>
			readerTranscript(page).evaluate(
				(host) => host.shadowRoot!.querySelector('.scroll')!.scrollTop
			)
		)
		.toBeGreaterThan(0);
	expect(await page.evaluate(() => window.scrollY)).toBe(300);
	// The player kept its height in the page, so nothing moved under it.
	const top = await page
		.locator('#after')
		.evaluate((element) => element.getBoundingClientRect().top);
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('');
	expect(
		await page.locator('#after').evaluate((element) => element.getBoundingClientRect().top)
	).toBe(top);
	expect(await page.evaluate(() => window.scrollY)).toBe(300);
});

test('a page’s own button: openTranscript(), the close event, focus back to it', async ({
	page
}) => {
	await serveTranscript(
		page,
		`<button id="card" type="button">Read the transcript</button>${player()}` +
			`<script>window.closes = 0; document.addEventListener('showfm:transcript-close', () => window.closes++); ` +
			`document.getElementById('card').addEventListener('click', () => { window.opened = document.getElementById('player').openTranscript(); });</script>`
	);
	await page.getByRole('button', { name: 'Transcript', exact: true }).waitFor();
	await page.getByRole('button', { name: 'Read the transcript' }).click();
	await readerReady(page);
	expect(await page.evaluate(() => (window as unknown as { opened: boolean }).opened)).toBe(true);
	await page.keyboard.press('Escape');
	await expect(dialog(page)).toHaveCount(0);
	expect(await focused(page)).toBe('button#card:Read the transcript');
	expect(await page.evaluate(() => (window as unknown as { closes: number }).closes)).toBe(1);
	// A player with no transcript to offer says so.
	await page.locator('showfm-player').evaluate((host) => host.removeAttribute('transcript'));
	expect(
		await page
			.locator('showfm-player')
			.evaluate((host) => (host as HTMLElement & { openTranscript(): boolean }).openTranscript())
	).toBe(false);
	await expect(dialog(page)).toHaveCount(0);
});

test('follows along, seeks, searches and comes back to now in the reader', async ({ page }) => {
	await serveTranscript(page, player());
	await page.getByRole('button', { name: 'Transcript' }).click();
	await readerReady(page);
	await dialog(page).getByRole('button', { name: 'Play', exact: true }).click();
	const tr = readerTranscript(page);
	// Word by word: the spoken line, and one word in it.
	await expect(tr.locator('.line.now .txt .now')).toHaveCount(1);
	const { cues } = conversationVtt();
	await tr.locator('.line[data-i="4"] .txt').click();
	await expect(tr.locator('.line.now')).toHaveAttribute('data-i', '4');
	const time = (await audios(page))[0].time;
	expect(time).toBeGreaterThanOrEqual(cues[4].start);
	expect(time).toBeLessThan(cues[4].end);
	// Scrolling away offers Back to now, which follows again.
	await tr.locator('.scroll').hover();
	await page.mouse.wheel(0, 2500);
	const back = tr.getByRole('button', { name: /Back to now/ });
	await expect(back).toBeVisible();
	await back.click();
	await expect(back).toHaveCount(0);
	await expectNoAxeViolations(page);
});

test('speaker photos: a photo, initials without one, and speaker-photos="off"', async ({
	page
}) => {
	await serveTranscript(page, player());
	await page.getByRole('button', { name: 'Transcript' }).click();
	await readerReady(page);
	const tr = readerTranscript(page);
	const avatar = (speaker: string) =>
		tr.locator('.spk', { hasText: speaker }).first().locator('.av');
	await expect(avatar('Maya')).toHaveJSProperty('localName', 'img');
	await expect(avatar('Maya')).toHaveAttribute('src', MAYA_PHOTO);
	await expect(avatar('Maya')).toHaveAttribute('alt', '');
	await expect
		.poll(() => avatar('Maya').evaluate((img: HTMLImageElement) => img.naturalWidth))
		.toBe(2);
	await expect(avatar('Tom')).toHaveText('T');
	await expect(avatar('Tom')).toHaveAttribute('aria-hidden', 'true');
	// Live: off swaps the photo for initials, on brings it back.
	await page
		.locator('showfm-player')
		.evaluate((host) => host.setAttribute('speaker-photos', 'off'));
	await expect(avatar('Maya')).toHaveText('M');
	await page.locator('showfm-player').evaluate((host) => host.removeAttribute('speaker-photos'));
	await expect(avatar('Maya')).toHaveJSProperty('localName', 'img');
});

test('a photo that fails to load falls back to initials', async ({ page }) => {
	await serveTranscript(page, player());
	await page.route(MAYA_PHOTO, (route) => route.fulfill({ status: 404, body: '' }));
	await page.getByRole('button', { name: 'Transcript' }).click();
	await readerReady(page);
	await expect(
		readerTranscript(page).locator('.spk', { hasText: 'Maya' }).first().locator('.av')
	).toHaveText('M');
});

test('transcript="on" keeps its panel under the controls', async ({ page }) => {
	await serveTranscript(page, player().replace('transcript="reader"', 'transcript="on"'));
	const button = page.getByRole('button', { name: 'Transcript' });
	await button.click();
	await expect(button).toHaveAttribute('aria-expanded', 'true');
	await expect(button).not.toHaveAttribute('aria-haspopup');
	await expect(dialog(page)).toHaveCount(0);
	// No photos outside the reader.
	await page.waitForFunction(
		() =>
			!!document
				.querySelector('showfm-player')
				?.shadowRoot?.querySelector('.tr')
				?.shadowRoot?.querySelector('.line')
	);
	expect(
		await page
			.locator('showfm-player')
			.evaluate(
				(host) => host.shadowRoot!.querySelector('.tr')!.shadowRoot!.querySelectorAll('.av').length
			)
	).toBe(0);
});
