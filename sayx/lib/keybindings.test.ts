import { describe, expect, test } from 'bun:test'

import type { Key } from 'ink'
import type { KeybindingMap } from './types.ts'
import { getBindingLabel, matchInput } from './keybindings.ts'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const emptyKey: Key = {
	upArrow: false,
	downArrow: false,
	leftArrow: false,
	rightArrow: false,
	pageDown: false,
	pageUp: false,
	return: false,
	escape: false,
	ctrl: false,
	shift: false,
	tab: false,
	backspace: false,
	delete: false,
	meta: false,
}

function key(overrides: Partial<Key> = {}): Key {
	return { ...emptyKey, ...overrides }
}

const bindings: KeybindingMap = {
	play: 'enter',
	stop: 'space',
	nextVoice: 'down',
	prevVoice: 'up',
	rateUp: '=',
	rateDown: '-',
	rateUpBig: ']',
	rateDownBig: '[',
	modeDeterministic: 'd',
	modeWikipedia: 'w',
	modeQuote: 'r',
	modeCustom: 'c',
	toggleFavorite: 'f',
	viewFavorites: 'v',
	tagFilter: 't',
	search: '/',
	save: 's',
	help: '?',
	quit: 'q',
	tabNext: 'right',
	tabPrev: 'left',
}

// ── matchInput ─────────────────────────────────────────────────────────────────

describe('matchInput', () => {
	test('matches character keys', () => {
		expect(matchInput('q', key(), bindings)?.action).toBe('quit')
		expect(matchInput('f', key(), bindings)?.action).toBe('toggleFavorite')
		expect(matchInput('/', key(), bindings)?.action).toBe('search')
	})

	test('matches space as stop', () => {
		expect(matchInput(' ', key(), bindings)?.action).toBe('stop')
	})

	test('matches enter as play', () => {
		expect(matchInput('', key({ return: true }), bindings)?.action).toBe('play')
	})

	test('matches arrow keys', () => {
		expect(matchInput('', key({ upArrow: true }), bindings)?.action).toBe('prevVoice')
		expect(matchInput('', key({ downArrow: true }), bindings)?.action).toBe('nextVoice')
		expect(matchInput('', key({ leftArrow: true }), bindings)?.action).toBe('tabPrev')
		expect(matchInput('', key({ rightArrow: true }), bindings)?.action).toBe('tabNext')
	})

	test('returns undefined for unbound keys', () => {
		expect(matchInput('x', key(), bindings)).toBeUndefined()
		expect(matchInput('z', key(), bindings)).toBeUndefined()
	})
})

// ── getBindingLabel ────────────────────────────────────────────────────────────

describe('getBindingLabel', () => {
	test('maps special keys to symbols', () => {
		expect(getBindingLabel('enter')).toBe('⏎')
		expect(getBindingLabel('space')).toBe('␣')
		expect(getBindingLabel('escape')).toBe('Esc')
		expect(getBindingLabel('up')).toBe('↑')
		expect(getBindingLabel('down')).toBe('↓')
	})

	test('passes through character bindings as-is', () => {
		expect(getBindingLabel('q')).toBe('q')
		expect(getBindingLabel('/')).toBe('/')
		expect(getBindingLabel('?')).toBe('?')
	})
})
