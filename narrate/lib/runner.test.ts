import { afterAll, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SpeechBackend } from './types'

const STATE_DIR = mkdtempSync(join(tmpdir(), 'narrate-runner-'))
process.env.NARRATE_STATE_DIR = STATE_DIR

// Loaded after the env var so `paths` resolves to the temp dir instead of the real state dir.
const { paths, readState } = await import('./state')
const { runNarration } = await import('./runner')

const SENTENCES = ['Alpha zero.', 'Bravo one.', 'Charlie two.', 'Delta three.', 'Echo four.'] as const
const TEXT = SENTENCES.join(' ')

const fakeBackend = (failing?: string): SpeechBackend => ({
	id: 'say',
	defaultVoiceId: 'fake',
	voices: async () => [],
	synthesize: async (text) => {
		if (text === failing) throw new Error(`synthesis failed for ${text}`)
		return { wavPath: text }
	},
})

const fakePlayer = (onChunk: (text: string) => void = () => undefined) => {
	const played: string[] = []

	const play = async (path: string) => {
		played.push(path)
		onChunk(path)
		await Bun.sleep(20)
	}

	return { played, play }
}

const run = (options: Partial<Parameters<typeof runNarration>[0]>, deps: Parameters<typeof runNarration>[1]) =>
	runNarration(
		{ text: TEXT, label: 'test', origin: 'stdin', backend: 'say', voiceId: 'fake', speed: 1, ...options },
		deps,
	)

beforeEach(() => {
	for (const path of [paths.state, paths.stop, paths.seek, paths.pid, paths.log]) rmSync(path, { force: true })
})

test('plays every chunk in order and ends done', async () => {
	const { played, play } = fakePlayer()
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played).toEqual([...SENTENCES])
	expect(state.phase).toBe('done')
	expect(state.skipped).toEqual([])
	expect((await readState())?.phase).toBe('done')
})

test('skips a chunk whose synthesis fails and keeps reading', async () => {
	const { played, play } = fakePlayer()
	const state = await run({}, { backend: fakeBackend(SENTENCES[2]), play })

	expect(played).toEqual(SENTENCES.filter((sentence) => sentence !== SENTENCES[2]))
	expect(state.skipped).toEqual([2])
	expect(state.phase).toBe('done')
	expect(await Bun.file(paths.log).text()).toContain('synthesis failed for Charlie two.')
})

test('seek jumps forward mid-run', async () => {
	const { played, play } = fakePlayer((text) => {
		if (text === SENTENCES[1]) writeFileSync(paths.seek, '4')
	})
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played).toEqual([SENTENCES[0], SENTENCES[1], SENTENCES[4]])
	expect(state.phase).toBe('done')
})

test('stop ends playback with no further chunks', async () => {
	const { played, play } = fakePlayer((text) => {
		if (text === SENTENCES[1]) writeFileSync(paths.stop, '')
	})
	const state = await run({}, { backend: fakeBackend(), play })

	expect(played).toEqual([SENTENCES[0], SENTENCES[1]])
	expect(state.phase).toBe('stopped')
	expect(state.chunkIndex).toBe(1)
})

test('startIndex begins mid-text', async () => {
	const { played, play } = fakePlayer()
	const state = await run({ startIndex: 2 }, { backend: fakeBackend(), play })

	expect(played).toEqual(SENTENCES.slice(2))
	expect(state.phase).toBe('done')
})

afterAll(() => rmSync(STATE_DIR, { recursive: true, force: true }))
