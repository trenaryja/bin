import { describe, expect, test } from 'bun:test'

import type { SayxConfig } from './types.ts'
import { type Action, type AppState, createInitialState, reduce } from './state.ts'

// ── Test fixtures ──────────────────────────────────────────────────────────────

const testConfig: SayxConfig = {
	defaultLanguage: 'en',
	defaultRate: 175,
	rateMin: 50,
	rateMax: 500,
	rateStep: 25,
	rateBigStep: 100,
	deterministicPhrases: ['Phrase one.', 'Phrase two.', 'Phrase three.'],
	keybindings: {} as SayxConfig['keybindings'],
	voices: {
		Albert: { bio: 'Classic voice', tags: ['classic', 'robotic'] },
		Samantha: { bio: 'Default voice', tags: ['natural', 'female'] },
	},
	favorites: [],
}

const configWithFavorites: SayxConfig = {
	...testConfig,
	favorites: [
		{ voice: 'Samantha', rate: 200 },
		{ voice: 'Albert', rate: 150 },
	],
}

function state(overrides: Partial<AppState> = {}): AppState {
	return { ...createInitialState(testConfig), ...overrides }
}

function apply(s: AppState, ...actions: Action[]): AppState {
	return actions.reduce(reduce, s)
}

// ── Initial state ──────────────────────────────────────────────────────────────

describe('createInitialState', () => {
	test('starts on voices tab when no favorites', () => {
		const s = createInitialState(testConfig)
		expect(s.activeTab).toBe('voices')
		expect(s.focusArea).toBe('list')
		expect(s.activeTags).toEqual(['lang/en'])
	})

	test('starts on favorites tab when favorites exist', () => {
		const s = createInitialState(configWithFavorites)
		expect(s.activeTab).toBe('favorites')
	})

	test('initializes rate from config', () => {
		const s = createInitialState(testConfig)
		expect(s.rate).toBe(175)
	})

	test('loads first deterministic phrase', () => {
		const s = createInitialState(testConfig)
		expect(s.currentText).toBe('Phrase one.')
	})

	test('starts clean (not dirty)', () => {
		const s = createInitialState(testConfig)
		expect(s.dirty).toBe(false)
	})
})

// ── Tab navigation ─────────────────────────────────────────────────────────────

describe('tab navigation', () => {
	test('TAB_NEXT cycles voices → favorites → settings → voices', () => {
		let s = state({ activeTab: 'voices' })
		s = reduce(s, { type: 'TAB_NEXT' })
		expect(s.activeTab).toBe('favorites')
		s = reduce(s, { type: 'TAB_NEXT' })
		expect(s.activeTab).toBe('settings')
		s = reduce(s, { type: 'TAB_NEXT' })
		expect(s.activeTab).toBe('voices')
	})

	test('TAB_PREV cycles backwards', () => {
		let s = state({ activeTab: 'voices' })
		s = reduce(s, { type: 'TAB_PREV' })
		expect(s.activeTab).toBe('settings')
		s = reduce(s, { type: 'TAB_PREV' })
		expect(s.activeTab).toBe('favorites')
	})

	test('SWITCH_TAB sets specific tab', () => {
		const s = reduce(state(), { type: 'SWITCH_TAB', tab: 'settings' })
		expect(s.activeTab).toBe('settings')
	})
})

// ── Focus management ───────────────────────────────────────────────────────────

describe('focus management', () => {
	test('FOCUS sets focus area', () => {
		const s = reduce(state(), { type: 'FOCUS', area: 'search' })
		expect(s.focusArea).toBe('search')
	})

	test('NAVIGATE_UP from cursor 0 on voices tab moves focus to tags', () => {
		const s = reduce(state({ voiceCursor: 0 }), { type: 'NAVIGATE_UP' })
		expect(s.focusArea).toBe('tags')
		expect(s.voiceCursor).toBe(0)
	})

	test('NAVIGATE_UP from cursor > 0 decrements cursor', () => {
		const s = reduce(state({ voiceCursor: 5 }), { type: 'NAVIGATE_UP' })
		expect(s.voiceCursor).toBe(4)
		expect(s.focusArea).toBe('list')
	})

	test('NAVIGATE_UP on favorites tab decrements favCursor', () => {
		const s = reduce(
			state({ activeTab: 'favorites', favCursor: 2, favorites: [{ voice: 'A', rate: 100 }, { voice: 'B', rate: 100 }, { voice: 'C', rate: 100 }] }),
			{ type: 'NAVIGATE_UP' },
		)
		expect(s.favCursor).toBe(1)
	})

	test('NAVIGATE_UP on favorites at 0 clamps to 0', () => {
		const s = reduce(
			state({ activeTab: 'favorites', favCursor: 0, favorites: [{ voice: 'A', rate: 100 }] }),
			{ type: 'NAVIGATE_UP' },
		)
		expect(s.favCursor).toBe(0)
	})

	test('NAVIGATE_DOWN increments voice cursor', () => {
		const s = reduce(state({ voiceCursor: 3 }), { type: 'NAVIGATE_DOWN', voiceCount: 10 })
		expect(s.voiceCursor).toBe(4)
	})

	test('NAVIGATE_DOWN scrolls viewport when cursor passes bottom', () => {
		const s = reduce(state({ voiceCursor: 17, scrollOffset: 0 }), { type: 'NAVIGATE_DOWN', voiceCount: 30 })
		expect(s.voiceCursor).toBe(18)
		expect(s.scrollOffset).toBe(1) // 18 - 18 + 1
	})

	test('NAVIGATE_UP scrolls viewport when cursor passes top', () => {
		const s = reduce(state({ voiceCursor: 5, scrollOffset: 5 }), { type: 'NAVIGATE_UP' })
		expect(s.voiceCursor).toBe(4)
		expect(s.scrollOffset).toBe(4)
	})

	test('NAVIGATE_DOWN clamps to last voice', () => {
		const s = reduce(state({ voiceCursor: 9 }), { type: 'NAVIGATE_DOWN', voiceCount: 10 })
		expect(s.voiceCursor).toBe(9)
	})

	test('NAVIGATE_DOWN with empty voice list is a no-op', () => {
		const s = state({ voiceCursor: 0 })
		expect(reduce(s, { type: 'NAVIGATE_DOWN', voiceCount: 0 })).toEqual(s)
	})

	test('NAVIGATE_DOWN on settings tab is a no-op', () => {
		const s = state({ activeTab: 'settings', voiceCursor: 0 })
		expect(reduce(s, { type: 'NAVIGATE_DOWN', voiceCount: 10 })).toEqual(s)
	})
})

// ── Search and filters ─────────────────────────────────────────────────────────

describe('search and filters', () => {
	test('SET_SEARCH updates query and resets cursor', () => {
		const s = reduce(state({ voiceCursor: 5, scrollOffset: 3 }), { type: 'SET_SEARCH', query: 'fred' })
		expect(s.searchQuery).toBe('fred')
		expect(s.voiceCursor).toBe(0)
		expect(s.scrollOffset).toBe(0)
	})

	test('SET_TAGS updates tags and resets cursor', () => {
		const s = reduce(state({ voiceCursor: 5 }), { type: 'SET_TAGS', tags: ['classic', 'robotic'] })
		expect(s.activeTags).toEqual(['classic', 'robotic'])
		expect(s.voiceCursor).toBe(0)
	})

	test('SET_TAGS with lang/ tags filters by language', () => {
		const s = reduce(state({ voiceCursor: 5 }), { type: 'SET_TAGS', tags: ['lang/fr', 'lang/de'] })
		expect(s.activeTags).toEqual(['lang/fr', 'lang/de'])
		expect(s.voiceCursor).toBe(0)
	})
})

// ── Rate adjustment ────────────────────────────────────────────────────────────

describe('rate adjustment', () => {
	test('ADJUST_RATE increases rate', () => {
		const s = reduce(state({ rate: 175 }), { type: 'ADJUST_RATE', delta: 25, min: 50, max: 500 })
		expect(s.rate).toBe(200)
	})

	test('ADJUST_RATE clamps to max', () => {
		const s = reduce(state({ rate: 490 }), { type: 'ADJUST_RATE', delta: 25, min: 50, max: 500 })
		expect(s.rate).toBe(500)
	})

	test('ADJUST_RATE clamps to min', () => {
		const s = reduce(state({ rate: 60 }), { type: 'ADJUST_RATE', delta: -25, min: 50, max: 500 })
		expect(s.rate).toBe(50)
	})

	test('ADJUST_RATE with large negative delta clamps to min', () => {
		const s = reduce(state({ rate: 175 }), { type: 'ADJUST_RATE', delta: -200, min: 50, max: 500 })
		expect(s.rate).toBe(50)
	})
})

// ── Playback ───────────────────────────────────────────────────────────────────

describe('playback', () => {
	test('PLAY_TEXT sets playing state and increments playCount', () => {
		const s = reduce(state(), { type: 'PLAY_TEXT', text: 'Hello world', voice: 'Samantha' })
		expect(s.playing).toBe(true)
		expect(s.playingVoice).toBe('Samantha')
		expect(s.currentText).toBe('Hello world')
		expect(s.playCount).toBe(1)
	})

	test('PLAY_TEXT increments playCount on each call', () => {
		const s = apply(
			state(),
			{ type: 'PLAY_TEXT', text: 'Hello', voice: 'A' },
			{ type: 'PLAY_TEXT', text: 'Hello', voice: 'A' },
			{ type: 'PLAY_TEXT', text: 'Hello', voice: 'A' },
		)
		expect(s.playCount).toBe(3)
	})

	test('STOP clears playing state', () => {
		const s = reduce(state({ playing: true, playingVoice: 'Albert' }), { type: 'STOP' })
		expect(s.playing).toBe(false)
		expect(s.playingVoice).toBe('')
	})

	test('PLAYBACK_ENDED clears playing state', () => {
		const s = reduce(state({ playing: true, playingVoice: 'Albert' }), { type: 'PLAYBACK_ENDED' })
		expect(s.playing).toBe(false)
		expect(s.playingVoice).toBe('')
	})

	test('PICK_QUOTE sets text source and starts playing', () => {
		const s = reduce(state(), { type: 'PICK_QUOTE', voice: 'Samantha' })
		expect(s.textSource).toBe('quote')
		expect(s.playing).toBe(true)
		expect(s.playingVoice).toBe('Samantha')
		expect(s.currentText.length).toBeGreaterThan(0)
	})
})

// ── Deterministic phrase cycling ───────────────────────────────────────────────

describe('deterministic cycling', () => {
	test('CYCLE_DETERMINISTIC advances to next phrase', () => {
		const s = reduce(
			state({ textSource: 'deterministic', detIndex: 0 }),
			{ type: 'CYCLE_DETERMINISTIC', phrases: testConfig.deterministicPhrases },
		)
		expect(s.detIndex).toBe(1)
		expect(s.currentText).toBe('Phrase two.')
	})

	test('CYCLE_DETERMINISTIC wraps around', () => {
		const s = reduce(
			state({ textSource: 'deterministic', detIndex: 2 }),
			{ type: 'CYCLE_DETERMINISTIC', phrases: testConfig.deterministicPhrases },
		)
		expect(s.detIndex).toBe(3)
		expect(s.currentText).toBe('Phrase one.') // 3 % 3 = 0
	})

	test('CYCLE_DETERMINISTIC resets index when switching from another source', () => {
		const s = reduce(
			state({ textSource: 'wikipedia', detIndex: 5 }),
			{ type: 'CYCLE_DETERMINISTIC', phrases: testConfig.deterministicPhrases },
		)
		expect(s.detIndex).toBe(0)
		expect(s.textSource).toBe('deterministic')
		expect(s.currentText).toBe('Phrase one.')
	})
})

// ── Favorites ──────────────────────────────────────────────────────────────────

describe('favorites', () => {
	test('TOGGLE_FAVORITE adds a new favorite', () => {
		const s = reduce(state({ rate: 200 }), { type: 'TOGGLE_FAVORITE', voiceName: 'Albert' })
		expect(s.favorites).toHaveLength(1)
		expect(s.favorites[0]).toEqual({ voice: 'Albert', rate: 200 })
		expect(s.dirty).toBe(true)
		expect(s.statusMsg).toContain('Added Albert')
	})

	test('TOGGLE_FAVORITE removes existing favorite', () => {
		const s = reduce(
			state({ favorites: [{ voice: 'Albert', rate: 200 }] }),
			{ type: 'TOGGLE_FAVORITE', voiceName: 'Albert' },
		)
		expect(s.favorites).toHaveLength(0)
		expect(s.dirty).toBe(true)
		expect(s.statusMsg).toContain('Removed Albert')
	})

	test('TOGGLE_FAVORITE preserves rate at time of favoriting', () => {
		const s = reduce(state({ rate: 375 }), { type: 'TOGGLE_FAVORITE', voiceName: 'Samantha' })
		expect(s.favorites[0]!.rate).toBe(375)
	})

	test('REMOVE_FAVORITE removes by index', () => {
		const s = reduce(
			state({ favorites: [{ voice: 'A', rate: 100 }, { voice: 'B', rate: 200 }, { voice: 'C', rate: 300 }] }),
			{ type: 'REMOVE_FAVORITE', index: 1 },
		)
		expect(s.favorites).toEqual([{ voice: 'A', rate: 100 }, { voice: 'C', rate: 300 }])
		expect(s.dirty).toBe(true)
	})

	test('REMOVE_FAVORITE clamps favCursor', () => {
		const s = reduce(
			state({ favorites: [{ voice: 'A', rate: 100 }, { voice: 'B', rate: 200 }], favCursor: 1 }),
			{ type: 'REMOVE_FAVORITE', index: 1 },
		)
		expect(s.favCursor).toBe(0)
	})

	test('REMOVE_FAVORITE on last item sets cursor to 0', () => {
		const s = reduce(
			state({ favorites: [{ voice: 'A', rate: 100 }], favCursor: 0 }),
			{ type: 'REMOVE_FAVORITE', index: 0 },
		)
		expect(s.favorites).toHaveLength(0)
		expect(s.favCursor).toBe(0)
	})
})

// ── Save/dirty state ───────────────────────────────────────────────────────────

describe('save and dirty state', () => {
	test('SAVE_DONE clears dirty flag', () => {
		const s = reduce(state({ dirty: true }), { type: 'SAVE_DONE', configPath: '/tmp/config.json' })
		expect(s.dirty).toBe(false)
		expect(s.statusMsg).toContain('/tmp/config.json')
	})

	test('SAVE_FAILED keeps dirty flag', () => {
		const s = reduce(state({ dirty: true }), { type: 'SAVE_FAILED' })
		expect(s.dirty).toBe(true)
		expect(s.statusMsg).toBe('Failed to save config')
	})

	test('favoriting sets dirty, saving clears it', () => {
		const s = apply(
			state(),
			{ type: 'TOGGLE_FAVORITE', voiceName: 'Albert' },
			{ type: 'SAVE_DONE', configPath: '/tmp/x' },
		)
		expect(s.dirty).toBe(false)
		expect(s.favorites).toHaveLength(1)
	})
})

// ── Overlays ───────────────────────────────────────────────────────────────────

describe('overlays', () => {

	test('OPEN_CUSTOM_TEXT sets overlay and pre-fills input', () => {
		const s = reduce(state({ customText: 'hello' }), { type: 'OPEN_CUSTOM_TEXT' })
		expect(s.overlay).toBe('custom-text')
		expect(s.customInput).toBe('hello')
	})

	test('DISMISS_OVERLAY clears overlay', () => {
		const s = reduce(state({ overlay: 'custom-text' }), { type: 'DISMISS_OVERLAY' })
		expect(s.overlay).toBeNull()
	})

	test('SUBMIT_CUSTOM_TEXT sets text source and closes overlay', () => {
		const s = reduce(state({ overlay: 'custom-text' }), { type: 'SUBMIT_CUSTOM_TEXT', text: 'custom words' })
		expect(s.overlay).toBeNull()
		expect(s.textSource).toBe('custom')
		expect(s.currentText).toBe('custom words')
		expect(s.customText).toBe('custom words')
	})
})

// ── Status messages ────────────────────────────────────────────────────────────

describe('status messages', () => {
	test('STATUS sets message', () => {
		const s = reduce(state(), { type: 'STATUS', msg: 'hello' })
		expect(s.statusMsg).toBe('hello')
	})

	test('CLEAR_STATUS clears message', () => {
		const s = reduce(state({ statusMsg: 'hello' }), { type: 'CLEAR_STATUS' })
		expect(s.statusMsg).toBe('')
	})
})

// ── Cursor clamping ────────────────────────────────────────────────────────────

describe('cursor clamping', () => {
	test('CLAMP_CURSORS clamps voice cursor to voice count', () => {
		const s = reduce(state({ voiceCursor: 50 }), { type: 'CLAMP_CURSORS', voiceCount: 10, favCount: 5 })
		expect(s.voiceCursor).toBe(9)
	})

	test('CLAMP_CURSORS clamps fav cursor to fav count', () => {
		const s = reduce(state({ favCursor: 5 }), { type: 'CLAMP_CURSORS', voiceCount: 10, favCount: 3 })
		expect(s.favCursor).toBe(2)
	})

	test('CLAMP_CURSORS adjusts scroll offset when cursor is above viewport', () => {
		const s = reduce(state({ voiceCursor: 2, scrollOffset: 5 }), { type: 'CLAMP_CURSORS', voiceCount: 10, favCount: 0 })
		expect(s.scrollOffset).toBe(2)
	})

	test('CLAMP_CURSORS adjusts scroll offset when cursor is below viewport', () => {
		const s = reduce(state({ voiceCursor: 25, scrollOffset: 0 }), { type: 'CLAMP_CURSORS', voiceCount: 30, favCount: 0 })
		expect(s.scrollOffset).toBe(25 - 18 + 1) // cursor - VISIBLE_ROWS + 1
	})

	test('CLAMP_CURSORS handles empty voice list', () => {
		const s = reduce(state({ voiceCursor: 5 }), { type: 'CLAMP_CURSORS', voiceCount: 0, favCount: 0 })
		expect(s.voiceCursor).toBe(0)
	})
})

// ── Multi-step workflows ───────────────────────────────────────────────────────

describe('multi-step workflows', () => {
	test('search → navigate → play flow', () => {
		const s = apply(
			state(),
			{ type: 'FOCUS', area: 'search' },
			{ type: 'SET_SEARCH', query: 'fred' },
			{ type: 'FOCUS', area: 'list' },
			{ type: 'PLAY_TEXT', text: 'Hello', voice: 'Fred' },
		)
		expect(s.searchQuery).toBe('fred')
		expect(s.focusArea).toBe('list')
		expect(s.playing).toBe(true)
		expect(s.playingVoice).toBe('Fred')
	})

	test('favorite → save → change rate → favorite again at new rate', () => {
		const s = apply(
			state(),
			{ type: 'TOGGLE_FAVORITE', voiceName: 'Albert' },
			{ type: 'SAVE_DONE', configPath: '/tmp/x' },
			{ type: 'ADJUST_RATE', delta: 100, min: 50, max: 500 },
			{ type: 'TOGGLE_FAVORITE', voiceName: 'Samantha' },
		)
		expect(s.favorites).toHaveLength(2)
		expect(s.favorites[0]!.rate).toBe(175) // Albert at original rate
		expect(s.favorites[1]!.rate).toBe(275) // Samantha at adjusted rate
		expect(s.dirty).toBe(true) // dirty again after second favorite
	})

	test('cycle through all deterministic phrases', () => {
		let s = state({ textSource: 'deterministic' })
		const phrases = testConfig.deterministicPhrases
		const seen: string[] = []

		for (let i = 0; i < phrases.length; i++) {
			s = reduce(s, { type: 'CYCLE_DETERMINISTIC', phrases })
			seen.push(s.currentText)
		}

		expect(seen).toEqual(['Phrase two.', 'Phrase three.', 'Phrase one.'])
	})

	test('navigate to top of list, then up into tags, then up into search', () => {
		const s = apply(
			state({ voiceCursor: 2 }),
			{ type: 'NAVIGATE_UP' }, // cursor 1
			{ type: 'NAVIGATE_UP' }, // cursor 0
			{ type: 'NAVIGATE_UP' }, // → tags
		)
		expect(s.voiceCursor).toBe(0)
		expect(s.focusArea).toBe('tags')
	})
})
