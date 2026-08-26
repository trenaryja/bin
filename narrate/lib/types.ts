export const ORIGINS = ['transcript', 'stdin', 'file', 'clipboard', 'selection'] as const
export type Origin = (typeof ORIGINS)[number]

export type SourceText = { text: string; label: string; origin: Origin }

export type Source = { origin: Origin; resolve: () => Promise<SourceText> }

export type TranscriptMessage = {
	id: string
	sessionId: string
	cwd: string
	timestamp: string
	preview: string
}

export type Chunk = { index: number; text: string }

export const BACKEND_IDS = ['kokoro', 'say'] as const
export type BackendId = (typeof BACKEND_IDS)[number]

export type Voice = { id: string; name: string; language: string }

export type Synthesis = { wavPath: string }

export type SpeechBackend = {
	id: BackendId
	defaultVoiceId: string
	voices: () => Promise<Voice[]>
	synthesize: (text: string, voiceId: string, signal: AbortSignal) => Promise<Synthesis>
}

export const SUMMARIZER_IDS = ['claude', 'opencode'] as const
export type SummarizerId = (typeof SUMMARIZER_IDS)[number]

export type Summarizer = {
	id: SummarizerId
	available: () => Promise<boolean>
	summarize: (text: string, signal: AbortSignal) => Promise<string>
}

export const PHASES = ['synthesizing', 'playing', 'stopped', 'done', 'error'] as const
export type Phase = (typeof PHASES)[number]

export type PlaybackState = {
	phase: Phase
	pid: number
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	chunkIndex: number
	chunks: string[]
	skipped: number[]
	error?: string
	updatedAt: string
}
