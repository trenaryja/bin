import { rm } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'
import { BACKEND_IDS } from '../types'
import { getBackend } from '.'

const BINARY_BY_BACKEND = { kokoro: 'speech', say: 'say' } as const

const neverAborts = () => new AbortController().signal

describe.each([...BACKEND_IDS])('%s backend', (backendId) => {
	const backend = getBackend(backendId)
	const missing = !Bun.which(BINARY_BY_BACKEND[backendId])

	test.skipIf(missing)('lists at least one voice', async () => {
		const voices = await backend.voices()
		expect(voices.length).toBeGreaterThan(0)
		expect(voices[0]).toMatchObject({ id: expect.any(String), language: expect.any(String) })
	})

	test.skipIf(missing)('exposes an installed default voice', async () => {
		const voices = await backend.voices()
		expect(voices.some((voice) => voice.id === backend.defaultVoiceId)).toBe(true)
	})

	test.skipIf(missing)(
		'synthesizes a non-empty file and reuses it on a second call',
		async () => {
			const text = `Narrate backend test for ${backendId}.`
			const { wavPath } = await backend.synthesize(text, backend.defaultVoiceId, neverAborts())

			try {
				expect(await Bun.file(wavPath).exists()).toBe(true)
				expect(Bun.file(wavPath).size).toBeGreaterThan(0)
				expect(await backend.synthesize(text, backend.defaultVoiceId, neverAborts())).toEqual({ wavPath })
			} finally {
				await rm(wavPath, { force: true })
			}
		},
		120_000,
	)
})

// Only kokoro can fail this way: `say -v <unknown>` exits 0 and silently falls back to the system voice.
test.skipIf(!Bun.which('speech'))(
	'kokoro surfaces the tool output on a bad voice',
	async () => {
		const attempt = getBackend('kokoro').synthesize('hello', 'zz_nope', neverAborts())
		await expect(attempt).rejects.toThrow(/voiceNotFound/)
	},
	120_000,
)
