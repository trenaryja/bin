import * as R from 'remeda'
import type { SpeechBackend, Voice } from '../types'
import { createSynthesizer, failIfNonZero, run } from './shared'

// Voice ids are <language><gender>_<name>, so the first letter picks the locale.
const LOCALE_BY_PREFIX: Record<string, string> = {
	a: 'en_US',
	b: 'en_GB',
	e: 'es_ES',
	f: 'fr_FR',
	h: 'hi_IN',
	i: 'it_IT',
	j: 'ja_JP',
	p: 'pt_BR',
	z: 'zh_CN',
}

const DEFAULT_LOCALE = 'en_US'

const VOICE_LINE = /^\s*-\s+([a-z]{2}_[a-z]+)\s*$/

const localeOf = (voiceId: string) => LOCALE_BY_PREFIX[voiceId[0] ?? ''] ?? DEFAULT_LOCALE

const displayName = (voiceId: string) =>
	voiceId.replace(/^[a-z]{2}_/, '').replace(/^./, (initial) => initial.toUpperCase())

export const parseVoices = (output: string): Voice[] =>
	R.pipe(
		output,
		R.split('\n'),
		R.map((line) => VOICE_LINE.exec(line)?.[1]),
		R.filter(R.isNonNullish),
		R.map((id) => ({ id, name: displayName(id), language: localeOf(id) })),
	)

export const kokoroBackend: SpeechBackend = {
	id: 'kokoro',
	defaultVoiceId: 'af_heart',

	// --list-voices interleaves model-download and load progress with the list, hence the strict line match.
	voices: async () =>
		parseVoices(failIfNonZero('speech kokoro --list-voices', await run(['speech', 'kokoro', '--list-voices'])).stdout),

	synthesize: createSynthesizer('kokoro', '.wav', (text, voiceId, outputPath) => [
		'speech',
		'kokoro',
		text,
		'-o',
		outputPath,
		'--voice',
		voiceId,
		// Without this the CLI runs every voice through English G2P; it accepts `it` even though --help omits it.
		'--language',
		localeOf(voiceId).slice(0, 2),
	]),
}
