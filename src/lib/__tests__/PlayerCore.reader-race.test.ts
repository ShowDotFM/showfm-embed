/**
 * The reader's code arrives after the visitor asked for it (a lazy chunk in
 * v1.js, a dynamic import here). This file holds loadChunk on a gate, so a
 * request can be overtaken: the player goes, or moves to another episode,
 * before the code is here. Neither may open a reader. Kept apart from
 * PlayerCore.reader.test.ts because the gate mocks lazy-element for the file.
 */
import { render } from '@testing-library/svelte';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import PlayerCore from '../PlayerCore.svelte';
import type { PlayerEpisodeData } from '../types';

const gate = vi.hoisted(() => {
	let open!: () => void;
	const promise = new Promise<void>((resolve) => (open = resolve));
	return { promise, open };
});

// Every chunk the player loads waits for the gate, then loads as usual.
vi.mock('../lazy-element', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lazy-element')>();
	return {
		...actual,
		loadChunk: (chunk: Parameters<typeof actual.loadChunk>[0]) =>
			gate.promise.then(() => actual.loadChunk(chunk))
	};
});

const dialogProto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
const native = { showModal: dialogProto.showModal };
beforeAll(() => {
	dialogProto.showModal = function (this: HTMLDialogElement) {
		this.setAttribute('open', '');
	};
});
afterAll(() => {
	dialogProto.showModal = native.showModal;
});
beforeEach(() => vi.stubGlobal('fetch', async () => new Response('WEBVTT\n')));

const episode = (id: string, title: string): PlayerEpisodeData => ({
	id,
	title,
	published_at: '2026-07-01T10:00:00.000Z',
	audio: { url: 'https://m.cdn.media/a.mp3', content_type: 'audio/mpeg', duration_seconds: 60 },
	artwork: { url: null },
	links: { listen: 'https://show.fm/x/e/y' },
	transcript: { url: 'https://m.cdn.media/a.vtt', type: 'text/vtt' },
	podcast: { title: 'Show', brand_color: null, branding: { show_powered_by: false } }
});

it('opens nothing when the player goes, or moves to another episode, before the code is here', async () => {
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const gone = render(PlayerCore, {
		props: { episode: episode('11111111-1111-4111-8111-111111111111', 'One'), transcript: 'reader' }
	});
	expect(gone.component.openTranscript()).toBe(true);
	gone.unmount();

	const moved = render(PlayerCore, {
		props: { episode: episode('22222222-2222-4222-8222-222222222222', 'Two'), transcript: 'reader' }
	});
	expect(moved.component.openTranscript()).toBe(true);
	await moved.rerender({ episode: episode('33333333-3333-4333-8333-333333333333', 'Three') });

	// A request that nothing overtook still opens: the gate is not what stops the others.
	const kept = render(PlayerCore, {
		props: {
			episode: episode('44444444-4444-4444-8444-444444444444', 'Four'),
			transcript: 'reader'
		}
	});
	expect(kept.component.openTranscript()).toBe(true);

	gate.open();
	// The first import compiles the transcript's code: wait for the one that opens.
	await vi.waitFor(() => expect(kept.container.querySelector('dialog')).not.toBeNull(), {
		timeout: 10_000
	});
	await tick();
	expect(moved.container.querySelector('dialog')).toBeNull();
	expect(moved.container.querySelector('.tr-btn')).not.toBeNull();
	expect(errors).not.toHaveBeenCalled();
	errors.mockRestore();
});
