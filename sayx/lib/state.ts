import type { Favorite, SayxConfig, Tab, TextSource, VisualizationMode } from './types.ts'
import { VISUALIZATION_MODES } from './types.ts'
import { getDeterministicPhrase, getRandomQuote } from './text-sources.ts'

// ── State ──────────────────────────────────────────────────────────────────────

export type FocusArea = 'list' | 'search' | 'tags'
export type Overlay = 'custom-text' | null

export type AppState = {
	activeTab: Tab
	activeTags: string[]
	currentText: string
	customInput: string
	customText: string
	detIndex: number
	dirty: boolean
	favCursor: number
	favorites: Favorite[]
	focusArea: FocusArea
	overlay: Overlay
	playCount: number
	playing: boolean
	playingVoice: string
	rate: number
	scrollOffset: number
	searchQuery: string
	statusMsg: string
	textSource: TextSource
	visualization: VisualizationMode
	voiceCursor: number
}

export function createInitialState(config: SayxConfig): AppState {
	return {
		activeTab: config.favorites.length > 0 ? 'favorites' : 'voices',
		activeTags: config.defaultLanguage ? [`lang/${config.defaultLanguage}`] : [],
		currentText: getDeterministicPhrase(config.deterministicPhrases, 0),
		customInput: '',
		customText: '',
		detIndex: 0,
		dirty: false,
		favCursor: 0,
		favorites: config.favorites,
		focusArea: 'list',
		overlay: null,
		playCount: 0,
		playing: false,
		playingVoice: '',
		rate: config.defaultRate,
		scrollOffset: 0,
		searchQuery: '',
		statusMsg: '',
		textSource: 'deterministic',
		visualization: config.defaultVisualization,
		voiceCursor: 0,
	}
}

// ── Actions ────────────────────────────────────────────────────────────────────

const TABS: Tab[] = ['voices', 'favorites', 'settings']

export const VISIBLE_ROWS = 18

export type Action =
	| { type: 'ADJUST_RATE'; delta: number; max: number; min: number }
	| { type: 'CLAMP_CURSORS'; voiceCount: number; favCount: number }
	| { type: 'CLEAR_STATUS' }
	| { type: 'CYCLE_DETERMINISTIC'; phrases: string[] }
	| { type: 'CYCLE_VISUALIZATION' }
	| { type: 'DISMISS_OVERLAY' }
	| { type: 'FOCUS'; area: FocusArea }
	| { type: 'NAVIGATE_DOWN'; voiceCount: number }
	| { type: 'NAVIGATE_UP' }
	| { type: 'OPEN_CUSTOM_TEXT' }
	| { type: 'PICK_QUOTE'; voice: string }
	| { type: 'PLAY_TEXT'; text: string; voice: string }
	| { type: 'PLAYBACK_ENDED' }
	| { type: 'REMOVE_FAVORITE'; index: number }
	| { type: 'SAVE_DONE'; configPath: string }
	| { type: 'SAVE_FAILED' }
	| { type: 'SET_CUSTOM_INPUT'; value: string }
	| { type: 'SET_SEARCH'; query: string }
	| { type: 'SET_TAGS'; tags: string[] }
	| { type: 'STATUS'; msg: string }
	| { type: 'STOP' }
	| { type: 'SUBMIT_CUSTOM_TEXT'; text: string }
	| { type: 'SWITCH_TAB'; tab: Tab }
	| { type: 'TAB_NEXT' }
	| { type: 'TAB_PREV' }
	| { type: 'TOGGLE_FAVORITE'; voiceName: string }

// ── Helpers ────────────────────────────────────────────────────────────────────

function syncScroll(cursor: number, scrollOffset: number): number {
	if (cursor < scrollOffset) return cursor
	if (cursor >= scrollOffset + VISIBLE_ROWS) return cursor - VISIBLE_ROWS + 1
	return scrollOffset
}

// The two navigation arms are the only ones with real branching — pulled out so `reduce`
// stays a flat dispatch table.
function navigateUp(state: AppState): AppState {
	if (state.activeTab === 'voices') {
		if (state.voiceCursor === 0) return { ...state, focusArea: 'tags' }
		const cursor = state.voiceCursor - 1
		return { ...state, voiceCursor: cursor, scrollOffset: syncScroll(cursor, state.scrollOffset) }
	}

	if (state.activeTab === 'favorites') return { ...state, favCursor: Math.max(0, state.favCursor - 1) }

	return state
}

function navigateDown(state: AppState, voiceCount: number): AppState {
	if (state.activeTab === 'voices') {
		if (voiceCount === 0) return state
		const cursor = Math.min(voiceCount - 1, state.voiceCursor + 1)
		return { ...state, voiceCursor: cursor, scrollOffset: syncScroll(cursor, state.scrollOffset) }
	}

	if (state.activeTab === 'favorites')
		return { ...state, favCursor: Math.min(state.favorites.length - 1, state.favCursor + 1) }

	return state
}

// ── Reducer ────────────────────────────────────────────────────────────────────

export function reduce(state: AppState, action: Action): AppState {
	switch (action.type) {
		case 'SWITCH_TAB':
			return { ...state, activeTab: action.tab }
		case 'TAB_NEXT': {
			const idx = TABS.indexOf(state.activeTab)
			return { ...state, activeTab: TABS[(idx + 1) % TABS.length]! }
		}
		case 'TAB_PREV': {
			const idx = TABS.indexOf(state.activeTab)
			return { ...state, activeTab: TABS[(idx - 1 + TABS.length) % TABS.length]! }
		}
		case 'FOCUS':
			return { ...state, focusArea: action.area }
		case 'NAVIGATE_UP':
			return navigateUp(state)
		case 'NAVIGATE_DOWN':
			return navigateDown(state, action.voiceCount)
		case 'SET_SEARCH':
			return { ...state, searchQuery: action.query, voiceCursor: 0, scrollOffset: 0 }
		case 'SET_TAGS':
			return { ...state, activeTags: action.tags, voiceCursor: 0, scrollOffset: 0 }
		case 'ADJUST_RATE':
			return { ...state, rate: Math.max(action.min, Math.min(action.max, state.rate + action.delta)) }
		case 'PLAY_TEXT':
			return {
				...state,
				currentText: action.text,
				playing: true,
				playingVoice: action.voice,
				playCount: state.playCount + 1,
			}
		case 'PICK_QUOTE': {
			const text = getRandomQuote()
			return {
				...state,
				textSource: 'quote',
				currentText: text,
				playing: true,
				playingVoice: action.voice,
				playCount: state.playCount + 1,
			}
		}
		case 'CYCLE_DETERMINISTIC': {
			const nextIndex = state.textSource === 'deterministic' ? state.detIndex + 1 : 0
			const text = getDeterministicPhrase(action.phrases, nextIndex)
			return { ...state, textSource: 'deterministic', detIndex: nextIndex, currentText: text }
		}
		case 'STOP':
			return { ...state, playing: false, playingVoice: '' }
		case 'PLAYBACK_ENDED':
			return { ...state, playing: false, playingVoice: '' }
		case 'TOGGLE_FAVORITE': {
			const idx = state.favorites.findIndex((f) => f.voice === action.voiceName)
			const favorites =
				idx !== -1
					? state.favorites.filter((_, i) => i !== idx)
					: [...state.favorites, { voice: action.voiceName, rate: state.rate }]
			const msg =
				idx !== -1 ? `Removed ${action.voiceName} from favorites` : `Added ${action.voiceName} @ ${state.rate} wpm`
			return { ...state, favorites, dirty: true, statusMsg: msg }
		}
		case 'REMOVE_FAVORITE': {
			const favorites = state.favorites.filter((_, i) => i !== action.index)
			const favCursor = Math.min(state.favCursor, Math.max(0, favorites.length - 1))
			return { ...state, favorites, favCursor, dirty: true, statusMsg: 'Removed from favorites' }
		}
		case 'SAVE_DONE':
			return { ...state, dirty: false, statusMsg: `Saved to ${action.configPath}` }
		case 'SAVE_FAILED':
			return { ...state, statusMsg: 'Failed to save config' }
		case 'OPEN_CUSTOM_TEXT':
			return { ...state, overlay: 'custom-text', customInput: state.customText }
		case 'SUBMIT_CUSTOM_TEXT':
			return {
				...state,
				customText: action.text,
				textSource: 'custom',
				currentText: action.text,
				overlay: null,
				statusMsg: 'Text: custom',
			}
		case 'DISMISS_OVERLAY':
			return { ...state, overlay: null }
		case 'SET_CUSTOM_INPUT':
			return { ...state, customInput: action.value }
		case 'STATUS':
			return { ...state, statusMsg: action.msg }
		case 'CLEAR_STATUS':
			return { ...state, statusMsg: '' }
		case 'CYCLE_VISUALIZATION': {
			const idx = VISUALIZATION_MODES.indexOf(state.visualization)
			const next = VISUALIZATION_MODES[(idx + 1) % VISUALIZATION_MODES.length]!
			return { ...state, visualization: next }
		}
		case 'CLAMP_CURSORS': {
			const voiceCursor =
				state.voiceCursor >= action.voiceCount ? Math.max(0, action.voiceCount - 1) : state.voiceCursor
			const favCursor = state.favCursor >= action.favCount ? Math.max(0, action.favCount - 1) : state.favCursor
			let { scrollOffset } = state
			if (voiceCursor < scrollOffset) scrollOffset = voiceCursor
			else if (voiceCursor >= scrollOffset + VISIBLE_ROWS) scrollOffset = voiceCursor - VISIBLE_ROWS + 1
			return { ...state, voiceCursor, favCursor, scrollOffset }
		}
	}
}
