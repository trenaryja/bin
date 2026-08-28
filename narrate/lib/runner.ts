import { appendFile, rm } from 'node:fs/promises'
import { getBackend } from './backends'
import { chunk } from './chunk'
import { playWav } from './player'
import { ensureStateDirs, paths, readState, requestStop, writeState } from './state'
import type { BackendId, Origin, PlaybackState, SpeechBackend, Synthesis } from './types'

const PREFETCH_AHEAD = 3
const POLL_MS = 100
const TAKEOVER_TIMEOUT_MS = 3000

type RunOptions = {
	text: string
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	startIndex?: number
	maxChars?: number
}

type RunDeps = { backend?: SpeechBackend; play?: typeof playWav }

type Control = { type: 'rate'; speed: number } | { type: 'seek'; index: number } | { type: 'stop' }

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

const isAlive = (pid: number) => {
	try {
		process.kill(pid, 0)
		return true
	} catch {
		return false
	}
}

// Two runners sharing one state file and one pid file would fight over afplay, so the newcomer
// stops the incumbent and waits for it to exit before claiming the state dir.
const takeOverSession = async () => {
	const existing = await readState()
	if (!existing || existing.pid === process.pid) return
	if (existing.phase !== 'synthesizing' && existing.phase !== 'playing') return
	if (!isAlive(existing.pid)) return

	await requestStop()
	const deadline = Date.now() + TAKEOVER_TIMEOUT_MS
	while (Date.now() < deadline && isAlive(existing.pid)) await Bun.sleep(POLL_MS)
}

const clearSignals = () => Promise.all([paths.stop, paths.seek, paths.rate].map((path) => rm(path, { force: true })))

const readControl = async (): Promise<Control | null> => {
	if (await Bun.file(paths.stop).exists()) {
		await rm(paths.stop, { force: true })
		return { type: 'stop' }
	}

	const seek = Bun.file(paths.seek)

	if (await seek.exists()) {
		const index = Number((await seek.text()).trim())
		await rm(paths.seek, { force: true })
		return Number.isInteger(index) ? { type: 'seek', index: Math.max(0, index) } : null
	}

	const rate = Bun.file(paths.rate)
	if (!(await rate.exists())) return null
	const speed = Number((await rate.text()).trim())
	await rm(paths.rate, { force: true })
	return Number.isFinite(speed) && speed > 0 ? { type: 'rate', speed } : null
}

const pollControl = async (signal: AbortSignal) => {
	while (!signal.aborted) {
		const control = await readControl()
		if (control) return control
		await Bun.sleep(POLL_MS)
	}

	return null
}

type Raced<T> = { control: Control; value: null } | { control: null; value: T }

// Runs `work` while watching the sentinel files, so a stop or seek lands mid-synthesis or
// mid-chunk instead of at the next chunk boundary.
const raceControl = async <T>(work: Promise<T>): Promise<Raced<T>> => {
	const watcher = new AbortController()
	const poller = pollControl(watcher.signal)
	const completed: Promise<Raced<T>> = work.then((value) => ({ control: null, value }))
	const raced = await Promise.race<Raced<T>>([
		completed,
		poller.then((control) => (control ? { control, value: null } : completed)),
	])
	watcher.abort()
	if (raced.control) return raced
	// `narrate stop` kills afplay before the poller sees the sentinel; drain the poller so its read isn't lost
	const control = (await poller) ?? (await readControl())
	return control ? { control, value: null } : raced
}

export const runNarration = async (options: RunOptions, deps: RunDeps = {}) => {
	const { text, label, origin, voiceId, startIndex = 0, maxChars } = options
	let { speed } = options
	const backend = deps.backend ?? getBackend(options.backend)
	const play = deps.play ?? playWav

	ensureStateDirs()
	await takeOverSession()
	await clearSignals()

	const chunks = chunk(text, { maxChars })
	const state: PlaybackState = {
		phase: 'synthesizing',
		pid: process.pid,
		label,
		origin,
		backend: options.backend,
		voiceId,
		speed,
		chunkIndex: Math.max(0, startIndex),
		chunks: chunks.map((part) => part.text),
		skipped: [],
		updatedAt: new Date().toISOString(),
	}
	await writeState(state)

	let controller = new AbortController()
	const pending = new Map<number, Promise<Synthesis>>()

	const prefetch = (from: number) => {
		for (let index = from; index <= from + PREFETCH_AHEAD && index < chunks.length; index++) {
			if (pending.has(index)) continue
			const synthesis = backend.synthesize(chunks[index]!.text, voiceId, controller.signal)
			// A prefetch dropped by a seek is never awaited; without this it surfaces as an unhandled rejection.
			synthesis.catch(() => undefined)
			pending.set(index, synthesis)
		}
	}

	const abandonPrefetch = () => {
		controller.abort()
		controller = new AbortController()
		pending.clear()
	}

	const finish = async (phase: PlaybackState['phase'], error?: string) => {
		state.phase = phase
		if (error) state.error = error
		await writeState(state)
		await rm(paths.pid, { force: true })
		return state
	}

	const markPlaying = (index: number) => {
		state.phase = 'playing'
		state.chunkIndex = index
		return writeState(state)
	}

	const skipChunk = async (index: number, error: unknown) => {
		state.skipped.push(index)
		pending.delete(index)
		await appendFile(paths.log, `${new Date().toISOString()}\t${index}\t${message(error)}\n`)
		await writeState(state)
	}

	// A rate change keeps the prefetched audio (speed is applied by afplay, not baked into the wav)
	// and replays the current chunk, so at most one sentence restarts.
	const applyControl = async (control: Control, index: number) => {
		if (control.type === 'rate') {
			;({ speed } = control)
			state.speed = speed
			await writeState(state)
			return index
		}

		abandonPrefetch()
		return control.type === 'stop' ? null : control.index
	}

	const synthesize = async (index: number) => {
		prefetch(index)

		try {
			return await raceControl(pending.get(index)!)
		} catch (error) {
			await skipChunk(index, error)
			return null
		}
	}

	// Resolves to the index to play next, or null once a stop has been requested.
	const playChunk = async (index: number) => {
		const synthesized = await synthesize(index)
		if (!synthesized) return index + 1
		if (synthesized.control) return applyControl(synthesized.control, index)

		await markPlaying(index)
		// Own abort per play so a rate change can stop afplay without abandoning the prefetch.
		const playing = new AbortController()
		const played = await raceControl(
			play(synthesized.value.wavPath, speed, AbortSignal.any([controller.signal, playing.signal])),
		)

		if (!played.control) {
			pending.delete(index)
			return index + 1
		}

		playing.abort()
		return applyControl(played.control, index)
	}

	try {
		let index = state.chunkIndex

		while (index < chunks.length) {
			const next = await playChunk(index)
			if (next === null) return await finish('stopped')
			index = next
		}

		abandonPrefetch()
		return await finish('done')
	} catch (error) {
		abandonPrefetch()
		return await finish('error', message(error))
	}
}
