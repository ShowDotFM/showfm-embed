/**
 * The player's transcript reader (`transcript="reader"`, frames 2d and 2e
 * of the listen page design), ported from the app's TranscriptReader tests
 * (podcaster-plus-app at 84e1e6a4^). The reader is a modal dialog holding
 * this player's own body and the transcript, so:
 *
 * - one <audio> element, the same one, before, during and after;
 * - dialog semantics, a labelled Close, the header's context line;
 * - Close, focus back to what opened it, `ontranscriptclose` and the
 *   `showfm:transcript-close` event;
 * - the page held still while open, and released on close and unmount;
 * - `openTranscript()` for a page's own button, and false when there is
 *   nothing to open;
 * - speaker photos in the reader only, initials without one, `speakerPhotos`
 *   off, and no unsafe URL ever reaching a src;
 * - axe on the open reader, and its strings in German and French.
 *
 * jsdom has no showModal(): the stubs below open and close the dialog as a
 * browser does, minus the top layer. Escape, focus containment and the
 * real layout are covered in Chromium (tests/browser/reader.spec.ts).
 */
import { fireEvent, render, screen } from '@testing-library/svelte';
import { axe } from 'jest-axe';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import PlayerCore from '../PlayerCore.svelte';
import type { PlayerEpisodeData } from '../types';

const AXE_MEDIA_OPTIONS = {
	rules: { 'no-autoplay-audio': { enabled: false }, 'audio-caption': { enabled: false } }
};
const VTT = 'https://m.cdn.media/one.vtt';
const VTT_BODY =
	'WEBVTT\n\n00:00.000 --> 00:05.000\n<v Maya>Hello there.</v>\n\n00:05.000 --> 00:09.000\n<v Tom>Hi.</v>\n\n00:09.000 --> 00:12.000\n<v Ana María>Hola.</v>\n';
const MAYA = 'https://m.cdn.media/people/maya.png';

const playing = new WeakSet<HTMLMediaElement>();
const dialogProto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
const originalDialog = { showModal: dialogProto.showModal, close: dialogProto.close };

beforeAll(() => {
	Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
		configurable: true,
		get(this: HTMLMediaElement) {
			return !playing.has(this);
		}
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'play', {
		configurable: true,
		value: vi.fn(async function (this: HTMLMediaElement) {
			playing.add(this);
			this.dispatchEvent(new Event('play'));
		})
	});
	Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
		configurable: true,
		value: vi.fn(function (this: HTMLMediaElement) {
			if (!playing.delete(this)) return;
			this.dispatchEvent(new Event('pause'));
		})
	});
	dialogProto.showModal = function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
	dialogProto.close = function (this: HTMLDialogElement) {
		if (!this.hasAttribute('open')) return;
		this.removeAttribute('open');
		this.dispatchEvent(new Event('close'));
	};
});

afterAll(() => {
	dialogProto.showModal = originalDialog.showModal;
	dialogProto.close = originalDialog.close;
});

beforeEach(() => vi.stubGlobal('fetch', async () => new Response(VTT_BODY)));
afterEach(() => {
	vi.unstubAllGlobals();
	document.documentElement.style.overflow = '';
});

function makeEpisode(overrides: Partial<PlayerEpisodeData> = {}): PlayerEpisodeData {
	return {
		id: '11111111-2222-4333-8444-555555555555',
		title: 'The bakery',
		published_at: '2026-07-01T10:00:00.000Z',
		season_number: 2,
		episode_number: 4,
		audio: {
			url: 'https://m.cdn.media/audio.mp3',
			content_type: 'audio/mpeg',
			duration_seconds: 1843
		},
		artwork: { url: 'https://m.cdn.media/cover.jpg' },
		links: { listen: 'https://show.fm/test-signal/e/the-bakery' },
		transcript: { url: VTT, type: 'text/vtt' },
		people: [
			{ name: ' maya ', role: 'Host', photo_url: MAYA },
			{ name: 'Tom', role: 'Guest', photo_url: 'javascript:alert(1)' }
		],
		podcast: { title: 'Test Signal', brand_color: '#7E22CE', branding: { show_powered_by: true } },
		...overrides
	};
}

const transcriptButton = () => screen.getByRole('button', { name: 'Transcript' });
const dialogOf = (container: HTMLElement) => container.querySelector('dialog');
const headOf = (container: HTMLElement) =>
	container.querySelector('.rd-head')!.shadowRoot as ShadowRoot;
const textOf = (container: HTMLElement) =>
	container.querySelector('.rd-tr')!.shadowRoot as ShadowRoot;

/** Presses the player's Transcript button and waits for the reader's lines. */
async function openReader(container: HTMLElement) {
	await fireEvent.click(transcriptButton());
	await vi.waitFor(() => expect(textOf(container)?.querySelectorAll('.line')).toHaveLength(3), {
		timeout: 10_000
	});
}

describe('the reader (transcript="reader")', () => {
	it('is a dialog trigger, not a disclosure, and nothing opens until pressed', () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		expect(transcriptButton()).toHaveAttribute('aria-haspopup', 'dialog');
		expect(transcriptButton()).not.toHaveAttribute('aria-expanded');
		expect(dialogOf(container)).toBeNull();
		expect(container.querySelector('.tr, .rd-tr')).toBeNull();
	});

	it('keeps exactly ONE audio element, the same one, playing on through open and close', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		const audio = container.querySelector('audio')!;
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		expect(audio.paused).toBe(false);
		await openReader(container);
		expect(container.querySelectorAll('audio')).toHaveLength(1);
		expect(container.querySelector('audio')).toBe(audio);
		// The audio is not in the dialog: nothing about it moved.
		expect(dialogOf(container)!.contains(audio)).toBe(false);
		expect(audio.paused).toBe(false);
		// The player's own body is in the dialog, compact, and drives that audio.
		const body = dialogOf(container)!.querySelector('.body')!;
		expect(body).toHaveClass('body-compact');
		await fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		expect(audio.paused).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		await fireEvent.click(headOf(container).querySelector('button')!);
		await tick();
		expect(dialogOf(container)).toBeNull();
		expect(container.querySelectorAll('audio')).toHaveLength(1);
		expect(container.querySelector('audio')).toBe(audio);
		expect(audio.paused).toBe(false);
		expect(container.querySelector('.body')).toHaveClass('body-full');
	});

	it('follows the audio in the reader, and a click on a line seeks it', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		await openReader(container);
		const audio = container.querySelector('audio')!;
		await fireEvent.click(screen.getByRole('button', { name: 'Play' }));
		Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 6 });
		audio.dispatchEvent(new Event('timeupdate'));
		const lines = textOf(container);
		await vi.waitFor(() =>
			expect(lines.querySelector<HTMLElement>('.line[aria-current="true"]')?.dataset.i).toBe('1')
		);
		await fireEvent.click(lines.querySelector('.line[data-i="2"] .txt')!);
		expect(audio.currentTime).toBeCloseTo(9.01);
	});

	it('exposes dialog semantics, a labelled Close first, and the episode in its header', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		await openReader(container);
		const dialog = dialogOf(container)!;
		expect(dialog.open).toBe(true);
		expect(dialog).toHaveAttribute('aria-label', 'Transcript: The bakery');
		const head = headOf(container);
		const close = head.querySelector('button')!;
		expect(close).toHaveAttribute('aria-label', 'Close transcript');
		// Close takes focus, so the way out is heard first.
		expect(head.activeElement).toBe(close);
		expect(head.querySelector('.rd-kicker')).toHaveTextContent('Transcript');
		expect(head.querySelector('.rd-context')).toHaveTextContent(
			'Season 2 · Episode 4 · The bakery'
		);
		// The search row and the text are the transcript's; its own label is not shown twice.
		expect(textOf(container).querySelector('.tr')).toHaveClass('rd');
		expect(textOf(container).querySelector('input[type="search"]')).not.toBeNull();
		// The text fills the space: no fixed height.
		expect(textOf(container).querySelector<HTMLElement>('.scroll')!.style.height).toBe('');
	});

	it('does not say the number twice when the title already carries it', async () => {
		const { container } = render(PlayerCore, {
			props: {
				episode: makeEpisode({ title: 'Season 2, Episode 4 - The bakery' }),
				transcript: 'reader'
			}
		});
		await openReader(container);
		expect(headOf(container).querySelector('.rd-context')).toHaveTextContent(
			'Season 2, Episode 4 - The bakery'
		);
		expect(headOf(container).querySelector('.rd-context')!.textContent).not.toContain(
			'Season 2 · '
		);
	});

	it('closes from its Close button: focus back to the button, the event, then the callback', async () => {
		const order: string[] = [];
		const ontranscriptclose = vi.fn(() => order.push('callback'));
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader', ontranscriptclose }
		});
		container.addEventListener('showfm:transcript-close', () => order.push('event'));
		transcriptButton().focus();
		await openReader(container);
		await fireEvent.click(headOf(container).querySelector('button')!);
		await vi.waitFor(() => expect(ontranscriptclose).toHaveBeenCalledTimes(1));
		expect(order).toEqual(['event', 'callback']);
		expect(dialogOf(container)).toBeNull();
		// The button pressed was in the body the reader held: its replacement takes focus.
		expect(document.activeElement).toBe(transcriptButton());
	});

	it('openTranscript(): opens from a page’s own button and gives focus back to it', async () => {
		const card = document.createElement('button');
		card.textContent = 'Read the transcript';
		document.body.append(card);
		const view = render(PlayerCore, { props: { episode: makeEpisode(), transcript: 'reader' } });
		card.focus();
		expect(view.component.openTranscript()).toBe(true);
		await vi.waitFor(
			() => expect(textOf(view.container)?.querySelectorAll('.line')).toHaveLength(3),
			{ timeout: 10_000 }
		);
		// A second call while open opens nothing more.
		expect(view.component.openTranscript()).toBe(true);
		expect(view.container.querySelectorAll('dialog')).toHaveLength(1);
		dialogOf(view.container)!.close();
		await vi.waitFor(() => expect(document.activeElement).toBe(card));
		card.remove();
	});

	it('openTranscript(): false when there is nothing to open; on and open show the panel', async () => {
		for (const episode of [
			makeEpisode({ transcript: null }),
			makeEpisode({
				audio: { url: 'https://cdn.other-host.test/a.mp3', content_type: null, duration_seconds: 9 }
			})
		]) {
			const view = render(PlayerCore, { props: { episode, transcript: 'reader' } });
			expect(view.component.openTranscript()).toBe(false);
			await tick();
			expect(dialogOf(view.container)).toBeNull();
			view.unmount();
		}
		const off = render(PlayerCore, { props: { episode: makeEpisode() } });
		expect(off.component.openTranscript()).toBe(false);
		off.unmount();
		const on = render(PlayerCore, { props: { episode: makeEpisode(), transcript: 'on' } });
		expect(on.component.openTranscript()).toBe(true);
		await tick();
		expect(transcriptButton()).toHaveAttribute('aria-expanded', 'true');
		expect(on.container.querySelector('.tr')).not.toBeNull();
		expect(dialogOf(on.container)).toBeNull();
	});

	it('holds the page still only while open, and lets go if the player goes while open', async () => {
		document.documentElement.style.overflow = 'clip';
		const view = render(PlayerCore, { props: { episode: makeEpisode(), transcript: 'reader' } });
		await openReader(view.container);
		expect(document.documentElement.style.overflow).toBe('hidden');
		dialogOf(view.container)!.close();
		await vi.waitFor(() => expect(dialogOf(view.container)).toBeNull());
		expect(document.documentElement.style.overflow).toBe('clip');
		await openReader(view.container);
		expect(document.documentElement.style.overflow).toBe('hidden');
		view.unmount();
		expect(document.documentElement.style.overflow).toBe('clip');
	});

	it('keeps its place on the page while open', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		const player = container.querySelector<HTMLElement>('.player')!;
		Object.defineProperty(player, 'offsetHeight', { configurable: true, value: 291 });
		await openReader(container);
		expect(player.style.minHeight).toBe('291px');
	});

	it('has no axe violations open', { timeout: 20_000 }, async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		await openReader(container);
		// axe walks the open shadow roots: the header's and the transcript's.
		expect(await axe(container, AXE_MEDIA_OPTIONS)).toHaveNoViolations();
	});

	it('speaks German and French', async () => {
		for (const [lang, label, context] of [
			['de', 'Transkript: The bakery', 'Staffel 2 · Folge 4 · The bakery'],
			['fr', 'Transcription : The bakery', 'Saison 2 · Épisode 4 · The bakery']
		]) {
			const view = render(PlayerCore, {
				props: { episode: makeEpisode(), transcript: 'reader', lang }
			});
			await fireEvent.click(view.container.querySelector('.tr-btn')!);
			await vi.waitFor(
				() => {
					expect(dialogOf(view.container)).toHaveAttribute('aria-label', label);
					expect(headOf(view.container).querySelector('.rd-context')).toHaveTextContent(context);
				},
				{ timeout: 10_000 }
			);
			view.unmount();
		}
	});
});

describe('speaker photos', () => {
	const avatar = (container: HTMLElement, i: number) =>
		textOf(container).querySelector(`.line[data-i="${i}"] .spk .av`) as HTMLElement | null;

	it('the reader shows a photo by name (trimmed, any case), initials without a safe one', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		await openReader(container);
		const maya = avatar(container, 0)!;
		expect(maya.localName).toBe('img');
		expect(maya).toHaveAttribute('src', MAYA);
		expect(maya).toHaveAttribute('alt', '');
		// Tom's URL is not http(s): it never reaches a src.
		expect(avatar(container, 1)!.localName).toBe('span');
		expect(avatar(container, 1)).toHaveTextContent('T');
		expect(avatar(container, 1)).toHaveAttribute('aria-hidden', 'true');
		// No credit at all: initials from the first and last word.
		expect(avatar(container, 2)).toHaveTextContent('AM');
		expect(textOf(container).innerHTML).not.toContain('javascript:');
		// The name still reads as text beside it.
		expect(textOf(container).querySelector('.line[data-i="0"] .spk')).toHaveTextContent('Maya');
	});

	it('a photo that fails to load gives way to initials', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader' }
		});
		await openReader(container);
		avatar(container, 0)!.dispatchEvent(new Event('error'));
		expect(avatar(container, 0)!.localName).toBe('span');
		expect(avatar(container, 0)).toHaveTextContent('M');
	});

	it('speakerPhotos false: initials for everyone, live', async () => {
		const { container, rerender } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'reader', speakerPhotos: false }
		});
		await openReader(container);
		expect(avatar(container, 0)!.localName).toBe('span');
		expect(avatar(container, 0)).toHaveTextContent('M');
		await rerender({ speakerPhotos: true });
		await vi.waitFor(() => expect(avatar(container, 0)!.localName).toBe('img'));
	});

	it('a payload without people (cached before 1.7) shows initials', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode({ people: undefined }), transcript: 'reader' }
		});
		await openReader(container);
		expect(avatar(container, 0)).toHaveTextContent('M');
	});

	it('the panel under the controls (transcript="on") shows none', async () => {
		const { container } = render(PlayerCore, {
			props: { episode: makeEpisode(), transcript: 'open' }
		});
		const panel = container.querySelector('.tr')!;
		await vi.waitFor(() => expect(panel.shadowRoot?.querySelectorAll('.line')).toHaveLength(3), {
			timeout: 10_000
		});
		expect(panel.shadowRoot!.querySelectorAll('.av')).toHaveLength(0);
	});
});
