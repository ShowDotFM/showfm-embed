<!--
	The transcript reader's header (frames 2d and 2e): the close button, then
	"Transcript" over the episode's context line. Transcript.svelte mounts it
	into the player's header host, a shadow root of its own inside the
	reader's dialog, with transcript.css. The host takes no box, so these two
	are items of the dialog's grid, which places them (PlayerCore.svelte).

	Close is first in the dialog's tab order and takes focus when the reader
	opens: a screen reader hears the way out first, and a phone's keyboard
	does not cover the text.
-->
<script lang="ts">
	let {
		kicker,
		context,
		closeLabel,
		onclose
	}: {
		/** "Transcript". */
		kicker: string;
		/** "Season 2 · Episode 27 · Title", or the title alone. */
		context: string;
		closeLabel: string;
		onclose: () => void;
	} = $props();
</script>

<button type="button" class="rd-close" aria-label={closeLabel} onclick={onclose}>
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg
	>
</button>
<div class="rd-titles">
	<p class="rd-kicker">{kicker}</p>
	<p class="rd-context">{context}</p>
</div>
