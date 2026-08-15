import { defineConfig } from '@trenaryja/config/eslint'

export default defineConfig({
	rules: {
		// Every site is deliberate sequential I/O: batched tile fetches that already use
		// Promise.all internally and await for backpressure, or ordered CLI steps.
		'no-await-in-loop': 'off',

		// These are Ink terminal renderers, not the DOM. The lists are positional
		// (waveform bars, word spans, favorite rows) so the index *is* the identity.
		'@eslint-react/no-array-index-key': 'off',
	},
})
