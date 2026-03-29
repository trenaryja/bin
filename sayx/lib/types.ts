export type Voice = {
	name: string
	locale: string
	language: string
	sample: string
}

export type VoiceMeta = {
	bio: string
	tags: string[]
}

export type Favorite = {
	voice: string
	rate: number
	note?: string
}

export type TextSource = 'custom' | 'deterministic' | 'quote' | 'wikipedia'

export type Tab = 'favorites' | 'settings' | 'voices'

export type KeyAction =
	| 'help'
	| 'modeDeterministic'
	| 'modeCustom'
	| 'modeQuote'
	| 'modeWikipedia'
	| 'nextVoice'
	| 'play'
	| 'prevVoice'
	| 'quit'
	| 'rateDown'
	| 'rateDownBig'
	| 'rateUp'
	| 'rateUpBig'
	| 'save'
	| 'search'
	| 'stop'
	| 'tabNext'
	| 'tabPrev'
	| 'tagFilter'
	| 'toggleFavorite'
	| 'viewFavorites'

export type KeybindingMap = Record<KeyAction, string>

export type SayxConfig = {
	defaultLanguage: string
	defaultRate: number
	deterministicPhrases: string[]
	highlightDelay: number
	favorites: Favorite[]
	keybindings: KeybindingMap
	rateBigStep: number
	rateMax: number
	rateMin: number
	rateStep: number
	voices: Record<string, VoiceMeta>
}
