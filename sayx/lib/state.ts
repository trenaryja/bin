import type { Favorite, SayxConfig, Tab, TextSource } from './types.ts'
import { getDeterministicPhrase, getRandomQuote } from './text-sources.ts'

// ── State ──────────────────────────────────────────────────────────────────────

export type FocusArea = 'list' | 'search' | 'tags'
export type Overlay = 'custom-text' | 'language-filter' | null

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
	langFilter: string
	langInput: string
	overlay: Overlay
	playing: boolean
	playingVoice: string
	rate: number
	scrollOffset: number
	searchQuery: string
	statusMsg: string
	textSource: TextSource
	voiceCursor: number
}

export function createInitialState(config: SayxConfig): AppState {
	return {
		activeTab: config.favorites.length > 0 ? 'favorites' : 'voices',
		activeTags: [],
		currentText: getDeterministicPhrase(config.deterministicPhrases, 0),
		customInput: '',
		customText: '',
		detIndex: 0,
		dirty: false,
		favCursor: 0,
		favorites: config.favorites,
		focusArea: 'list',
		langFilter: config.defaultLanguage,
		langInput: '',
		overlay: null,
		playing: false,
		playingVoice: '',
		rate: config.defaultRate,
		scrollOffset: 0,
		searchQuery: '',
		statusMsg: '',
		textSource: 'deterministic',
		voiceCursor: 0,
	}
}

// ── Actions ────────────────────────────────────────────────────────────────────

const TABS: Tab[] = ['voices', 'favorites', 'settings']
const VISIBLE_ROWS = 18

export type Action =
	| { type: 'ADJUST_RATE'; delta: number; max: number; min: number }
	| { type: 'CLEAR_STATUS' }
	| { type: 'CLAMP_CURSORS'; voiceCount: number; favCount: number }
	| { type: 'CYCLE_DETERMINISTIC'; phrases: string[] }
	| { type: 'DISMISS_OVERLAY' }
	| { type: 'FOCUS'; area: FocusArea }
	| { type: 'NAVIGATE_DOWN'; voiceCount: number }
	| { type: 'NAVIGATE_UP' }
	| { type: 'OPEN_CUSTOM_TEXT' }
	| { type: 'OPEN_LANGUAGE_FILTER' }
	| { type: 'PLAYBACK_ENDED' }
	| { type: 'PLAY_TEXT'; text: string; voice: string }
	| { type: 'PICK_QUOTE'; voice: string }
	| { type: 'REMOVE_FAVORITE'; index: number }
	| { type: 'SAVE_DONE'; configPath: string }
	| { type: 'SAVE_FAILED' }
	| { type: 'SET_CUSTOM_INPUT'; value: string }
	| { type: 'SET_LANG_INPUT'; value: string }
	| { type: 'SET_SEARCH'; query: string }
	| { type: 'SET_TAGS'; tags: string[] }
	| { type: 'STATUS'; msg: string }
	| { type: 'STOP' }
	| { type: 'SUBMIT_CUSTOM_TEXT'; text: string; voice?: string }
	| { type: 'SUBMIT_LANGUAGE_FILTER'; lang: string }
	| { type: 'SWITCH_TAB'; tab: Tab }
	| { type: 'TAB_NEXT' }
	| { type: 'TAB_PREV' }
	| { type: 'TOGGLE_FAVORITE'; voiceName: string }

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

		case 'NAVIGATE_UP': {
			if (state.activeTab === 'voices') {
				if (state.voiceCursor === 0) return { ...state, focusArea: 'tags' }
				return { ...state, voiceCursor: state.voiceCursor - 1 }
			}
			if (state.activeTab === 'favorites') {
				return { ...state, favCursor: Math.max(0, state.favCursor - 1) }
			}
			return state
		}

		case 'NAVIGATE_DOWN': {
			if (state.activeTab === 'voices') {
				return { ...state, voiceCursor: Math.min(action.voiceCount - 1, state.voiceCursor + 1) }
			}
			if (state.activeTab === 'favorites') {
				return { ...state, favCursor: Math.min(state.favorites.length - 1, state.favCursor + 1) }
			}
			return state
		}

		case 'SET_SEARCH':
			return { ...state, searchQuery: action.query, voiceCursor: 0, scrollOffset: 0 }

		case 'SET_TAGS':
			return { ...state, activeTags: action.tags, voiceCursor: 0, scrollOffset: 0 }

		case 'ADJUST_RATE':
			return { ...state, rate: Math.max(action.min, Math.min(action.max, state.rate + action.delta)) }

		case 'PLAY_TEXT':
			return { ...state, currentText: action.text, playing: true, playingVoice: action.voice, textSource: state.textSource }

		case 'PICK_QUOTE': {
			const text = getRandomQuote()
			return { ...state, textSource: 'quote', currentText: text, playing: true, playingVoice: action.voice }
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
			const favorites = idx !== -1
				? state.favorites.filter((_, i) => i !== idx)
				: [...state.favorites, { voice: action.voiceName, rate: state.rate }]
			const msg = idx !== -1
				? `Removed ${action.voiceName} from favorites`
				: `Added ${action.voiceName} @ ${state.rate} wpm`
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

		case 'OPEN_LANGUAGE_FILTER':
			return { ...state, overlay: 'language-filter', langInput: state.langFilter }

		case 'OPEN_CUSTOM_TEXT':
			return { ...state, overlay: 'custom-text', customInput: state.customText }

		case 'SUBMIT_LANGUAGE_FILTER':
			return { ...state, langFilter: action.lang, voiceCursor: 0, scrollOffset: 0, overlay: null, statusMsg: action.lang ? `Filter: ${action.lang}` : 'Showing all languages' }

		case 'SUBMIT_CUSTOM_TEXT':
			return { ...state, customText: action.text, textSource: 'custom', currentText: action.text, overlay: null, statusMsg: 'Text: custom' }

		case 'DISMISS_OVERLAY':
			return { ...state, overlay: null }

		case 'SET_LANG_INPUT':
			return { ...state, langInput: action.value }

		case 'SET_CUSTOM_INPUT':
			return { ...state, customInput: action.value }

		case 'STATUS':
			return { ...state, statusMsg: action.msg }

		case 'CLEAR_STATUS':
			return { ...state, statusMsg: '' }

		case 'CLAMP_CURSORS': {
			const voiceCursor = state.voiceCursor >= action.voiceCount ? Math.max(0, action.voiceCount - 1) : state.voiceCursor
			const favCursor = state.favCursor >= action.favCount ? Math.max(0, action.favCount - 1) : state.favCursor
			let { scrollOffset } = state
			if (voiceCursor < scrollOffset) scrollOffset = voiceCursor
			else if (voiceCursor >= scrollOffset + VISIBLE_ROWS) scrollOffset = voiceCursor - VISIBLE_ROWS + 1
			return { ...state, voiceCursor, favCursor, scrollOffset }
		}
	}
}
