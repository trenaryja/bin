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

export type VisualizationMode = 'none' | 'perlin' | 'pulse' | 'rain' | 'spectrum' | 'waves'

export const VISUALIZATION_MODES: VisualizationMode[] = ['waves', 'perlin', 'spectrum', 'pulse', 'rain', 'none']

export type TextSource = 'custom' | 'deterministic' | 'quote' | 'wikipedia'

export type Tab = 'favorites' | 'settings' | 'voices'

export type KeyAction =
	| 'cycleVisualization'
	| 'help'
	| 'modeCustom'
	| 'modeDeterministic'
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

export type KeybindingMap = Record<KeyAction, string>

export type SayxConfig = {
	defaultLanguage: string
	defaultRate: number
	defaultVisualization: VisualizationMode
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
