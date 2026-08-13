import { defineConfig } from '@fullstacksjs/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
const config = [
	...defineConfig({
		files: ['**/*.ts', '**/*.tsx'],
		rules: {
			'perfectionist/sort-imports': 'off', // handled by vscode organize imports
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],

			// Classic cyclomatic complexity charges +1 per `case`, so a flat dispatch switch
			// — a reducer, a keybinding table — scores like deeply nested logic while being the
			// most readable form available. The `modified` variant counts a whole `switch` as 1,
			// which leaves the threshold measuring actual branching depth.
			complexity: ['error', { max: 14, variant: 'modified' }],

			// Every site is deliberate sequential I/O: batched tile fetches that already use
			// Promise.all internally and await for backpressure, or ordered CLI steps.
			'no-await-in-loop': 'off',

			// These are Ink terminal renderers, not the DOM. The lists are positional
			// (waveform bars, word spans, favorite rows) so the index *is* the identity.
			'@eslint-react/no-array-index-key': 'off',

			// Restates the preset so the last entry can win: without it, the preset
			// forces a blank line after every `case` — including before another `case`.
			// That turns an empty fallthrough case into a `no-fallthrough` error, so
			// `bun run fix` emitted code `bun run check` rejected.
			'@stylistic/padding-line-between-statements': [
				'warn',
				{ blankLine: 'always', prev: ['case', 'default'], next: '*' },
				{ blankLine: 'always', prev: '*', next: 'multiline-block-like' },
				{ blankLine: 'always', prev: 'multiline-block-like', next: '*' },
				{ blankLine: 'always', prev: ['type', 'interface'], next: '*' },
				{ blankLine: 'always', prev: 'directive', next: '*' },
				{ blankLine: 'never', prev: 'directive', next: 'directive' },
				{ blankLine: 'always', prev: 'import', next: '*' },
				{ blankLine: 'any', prev: '*', next: 'import' },
				{ blankLine: 'always', prev: 'directive', next: 'import' },
				{ blankLine: 'any', prev: ['if'], next: ['if'] },
				{ blankLine: 'never', prev: ['case', 'default'], next: ['case', 'default'] },
			],
		},
	}),
]

export default config
