import { spawnSync } from 'node:child_process'
import type { SpeechBackend, Voice } from '../types'
import { createSynthesizer, failIfNonZero, run } from './shared'

// `say -o out.wav` without this dies with "Opening output file failed: fmt?" (exit 1). With it the file is
// plain PCM that afplay opens.
const WAV_FORMAT = '--data-format=LEI16@22050'

const PREFERRED_VOICE_IDS = ['Ava (Premium)', 'Samantha']

// Names are padded to a 20-column field, but longer ones (`Eddy (Chinese (Taiwan))`) get a single space,
// so the locale is simply the last token before the `#` sample sentence.
export const parseVoices = (output: string): Voice[] => {
	const seen = new Set<string>()
	return output.split('\n').flatMap((line) => {
		const description = line.split('#')[0]?.trimEnd() ?? ''
		const separator = description.lastIndexOf(' ')
		if (separator < 1) return []
		const language = description.slice(separator + 1)
		const name = description.slice(0, separator).trimEnd()
		if (!name || !/^[a-z]{2,3}_/.test(language) || seen.has(name)) return []
		seen.add(name)
		return [{ id: name, name, language }]
	})
}

let cachedDefaultVoiceId: string | undefined

// A getter, not a constant: `say -v '?'` costs ~0.5s and importing this module has to stay cheap.
const resolveDefaultVoiceId = () => {
	if (!cachedDefaultVoiceId) {
		const installed = parseVoices(spawnSync('say', ['-v', '?'], { encoding: 'utf8' }).stdout ?? '')
		cachedDefaultVoiceId = PREFERRED_VOICE_IDS.find((id) => installed.some((voice) => voice.id === id)) ?? 'Samantha'
	}

	return cachedDefaultVoiceId
}

export const sayBackend: SpeechBackend = {
	id: 'say',

	get defaultVoiceId() {
		return resolveDefaultVoiceId()
	},

	voices: async () => parseVoices(failIfNonZero("say -v '?'", await run(['say', '-v', '?'])).stdout),

	synthesize: createSynthesizer('say', '.wav', (text, voiceId, outputPath) => [
		'say',
		'-v',
		voiceId,
		'-o',
		outputPath,
		WAV_FORMAT,
		text,
	]),
}
