import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureStateDirs, paths } from '../state'
import type { BackendId, SpeechBackend } from '../types'

type CommandBuilder = (text: string, voiceId: string, outputPath: string) => string[]

export const run = async (command: string[], signal?: AbortSignal) => {
	const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
	const kill = () => child.kill()
	signal?.addEventListener('abort', kill, { once: true })

	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		])
		return { exitCode, stdout, stderr }
	} finally {
		signal?.removeEventListener('abort', kill)
	}
}

// `speech kokoro` prints its failures on stdout and leaves stderr empty; `say` uses stderr.
const failureOutput = (stdout: string, stderr: string) => stderr.trim() || stdout.trim() || 'no output'

export const failIfNonZero = (label: string, result: Awaited<ReturnType<typeof run>>) => {
	if (result.exitCode !== 0)
		throw new Error(`${label} exited ${result.exitCode}: ${failureOutput(result.stdout, result.stderr)}`)
	return result
}

const cachePath = (cacheKey: string, extension: string) =>
	join(paths.audio, createHash('sha256').update(cacheKey).digest('hex').slice(0, 16) + extension)

export const createSynthesizer =
	(backendId: BackendId, extension: string, buildCommand: CommandBuilder): SpeechBackend['synthesize'] =>
	async (text, voiceId, signal) => {
		ensureStateDirs()
		const wavPath = cachePath(backendId + voiceId + text, extension)
		const cached = Bun.file(wavPath)
		if ((await cached.exists()) && cached.size > 0) return { wavPath }

		const result = await run(buildCommand(text, voiceId, wavPath), signal)

		if (result.exitCode !== 0 || signal.aborted) {
			// A killed or failed child can leave a truncated file that would then be served from cache.
			await rm(wavPath, { force: true })
			signal.throwIfAborted()
			failIfNonZero(backendId, result)
		}
		if (!(await Bun.file(wavPath).exists())) throw new Error(`${backendId} exited 0 but wrote no audio to ${wavPath}`)
		return { wavPath }
	}
