#!/usr/bin/env bun
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { runCLI } from '@/lib'
import * as R from 'remeda'
import {
	BACKEND_IDS,
	chunk,
	clipboardSource,
	ensureStateDirs,
	fileSource,
	getBackend,
	getSummarizer,
	listMessages,
	normalize,
	ORIGINS,
	parseFlags,
	paths,
	pickId,
	readState,
	requestRate,
	requestSeek,
	runNarration,
	stdinSource,
	stopPlayback,
	SUMMARIZER_IDS,
	transcriptSource,
} from './lib'
import type { BackendId, Origin, PlaybackState } from './lib'

const SOURCE_FLAGS = {
	message: 'string',
	file: 'string',
	clipboard: 'boolean',
	label: 'string',
	origin: 'string',
} as const
const SPEECH_FLAGS = { backend: 'string', voice: 'string', speed: 'number' } as const
const PLAY_FLAGS = {
	...SOURCE_FLAGS,
	...SPEECH_FLAGS,
	start: 'number',
	raw: 'boolean',
	foreground: 'boolean',
	json: 'boolean',
} as const
const SUMMARIZE_FLAGS = {
	...SOURCE_FLAGS,
	...SPEECH_FLAGS,
	summarizer: 'string',
	play: 'boolean',
	json: 'boolean',
} as const
const SOURCE_ONLY_FLAGS = { ...SOURCE_FLAGS, json: 'boolean' } as const

// The detached child re-reads its text from here, then deletes it; the prefix is what marks it disposable.
const HANDOFF_PREFIX = join(paths.root, 'handoff-')

// The summarizer API takes a cancellation signal and the CLI has nothing to cancel it with.
const NEVER_ABORTED = new AbortController().signal

type SourceFlags = { message?: string; file?: string; clipboard: boolean; label?: string; origin?: string }

type SpeechFlags = { backend?: string; voice?: string; speed?: number }

const emit = (json: boolean, data: unknown, text: () => string) =>
	console.log(json ? JSON.stringify(data, null, 2) : text())

const pickSource = (flags: SourceFlags) => {
	if (flags.message) return transcriptSource(flags.message)
	if (flags.file) return fileSource(flags.file)
	if (flags.clipboard) return clipboardSource()
	if (!process.stdin.isTTY) return stdinSource()
	throw new Error('no source: pass --message, --file, --clipboard, or pipe text on stdin')
}

const readSource = async (flags: SourceFlags) => {
	const resolved = await pickSource(flags).resolve()
	if (flags.file?.startsWith(HANDOFF_PREFIX)) await rm(flags.file, { force: true })
	return {
		text: resolved.text,
		label: flags.label ?? resolved.label,
		origin: pickId(ORIGINS, flags.origin, { fallback: resolved.origin, flag: 'origin' }),
	}
}

const speechOptions = (flags: SpeechFlags) => {
	const backend = pickId(BACKEND_IDS, flags.backend, { fallback: 'kokoro', flag: 'backend' })
	return { backend, voiceId: flags.voice ?? getBackend(backend).defaultVoiceId, speed: flags.speed ?? 1 }
}

// `bun build --compile` bakes the script into the binary, so execPath alone re-runs the CLI; under
// `bun narrate/cli.ts` execPath is bun itself and the script path has to be handed back.
const selfCommand = () => (Bun.main.startsWith('/$bunfs/') ? [process.execPath] : [process.execPath, Bun.main])

type Narration = {
	text: string
	label: string
	origin: Origin
	backend: BackendId
	voiceId: string
	speed: number
	startIndex: number
}

const detach = async ({ text, label, origin, backend, voiceId, speed, startIndex }: Narration) => {
	ensureStateDirs()
	const handoff = `${HANDOFF_PREFIX}${process.pid}-${Date.now()}.txt`
	await Bun.write(handoff, text)

	// The child gets `--raw`: the text handed over has already been normalized.
	const values = {
		file: handoff,
		label,
		origin,
		backend,
		voice: voiceId,
		speed: String(speed),
		start: String(startIndex),
	}
	const flags = R.flatMap(R.entries(values), ([flag, value]) => [`--${flag}`, value])

	const child = Bun.spawn([...selfCommand(), 'play', '--foreground', '--raw', ...flags], {
		detached: true,
		stdin: 'ignore',
		stdout: 'ignore',
		stderr: 'ignore',
	})

	child.unref()
	return { pid: child.pid, label, chunkTotal: chunk(text).length }
}

const describeState = (state: PlaybackState) =>
	`${state.phase}  ${state.chunkIndex + 1}/${state.chunks.length}  ${state.label}${state.error ? `  (${state.error})` : ''}`

const play = async (args: string[]) => {
	const { flags } = parseFlags(args, PLAY_FLAGS)
	const { backend, voiceId, speed } = speechOptions(flags)
	const source = await readSource(flags)
	const text = flags.raw ? source.text : normalize(source.text)
	if (!text.trim()) throw new Error(`nothing to speak in ${source.label}`)
	const narration = { ...source, text, backend, voiceId, speed, startIndex: flags.start ?? 0 }

	if (!flags.foreground) {
		const started = await detach(narration)
		return emit(flags.json, started, () => `${started.pid}  ${started.chunkTotal} chunks  ${started.label}`)
	}

	const state = await runNarration(narration)
	return emit(flags.json, state, () => describeState(state))
}

const stop = async (args: string[]) => {
	const { flags } = parseFlags(args, { json: 'boolean' })
	const stopped = await stopPlayback()
	emit(flags.json, { stopped }, () => (stopped ? 'stopped' : 'nothing playing'))
}

// A runner killed mid-narration leaves an active phase behind with a dead pid; only that combination
// is stale, so a finished `done` or `stopped` state still reads back as itself.
const isStale = (state: PlaybackState) => {
	if (state.phase !== 'synthesizing' && state.phase !== 'playing') return false

	try {
		process.kill(state.pid, 0)
		return false
	} catch {
		return true
	}
}

const status = async (args: string[]) => {
	const { flags } = parseFlags(args, { json: 'boolean' })
	const state = await readState()
	if (!state || isStale(state)) return emit(flags.json, { phase: 'idle' }, () => 'idle')
	return emit(flags.json, state, () => describeState(state))
}

const seek = async (args: string[]) => {
	const { flags, positional } = parseFlags(args, { json: 'boolean' })
	const index = Number(positional[0])
	if (!Number.isInteger(index) || index < 0) throw new Error('seek needs a chunk index: narrate seek <index>')
	await requestSeek(index)
	emit(flags.json, { index }, () => `seek ${index}`)
}

const rate = async (args: string[]) => {
	const { flags, positional } = parseFlags(args, { json: 'boolean' })
	const speed = Number(positional[0])
	if (!Number.isFinite(speed) || speed <= 0) throw new Error('rate needs a playback rate: narrate rate <speed>')
	await requestRate(speed)
	emit(flags.json, { speed }, () => `rate ${speed}`)
}

const list = async (args: string[]) => {
	const { flags } = parseFlags(args, { project: 'string', limit: 'number', json: 'boolean' })
	const messages = await listMessages({ project: flags.project, limit: flags.limit })
	emit(flags.json, messages, () => messages.map((x) => `${x.id}  ${x.timestamp}  ${x.preview}`).join('\n'))
}

const summarize = async (args: string[]) => {
	const { flags } = parseFlags(args, SUMMARIZE_FLAGS)
	const summarizer = getSummarizer(pickId(SUMMARIZER_IDS, flags.summarizer, { fallback: 'claude', flag: 'summarizer' }))
	if (!(await summarizer.available())) throw new Error(`${summarizer.id} is not on PATH`)

	const source = await readSource(flags)
	const summary = await summarizer.summarize(source.text, NEVER_ABORTED)
	if (!flags.play) return emit(flags.json, { summarizer: summarizer.id, label: source.label, summary }, () => summary)

	const playback = await detach({ ...source, ...speechOptions(flags), text: normalize(summary), startIndex: 0 })
	return emit(flags.json, { summarizer: summarizer.id, label: source.label, summary, playback }, () => summary)
}

const voices = async (args: string[]) => {
	const { flags } = parseFlags(args, { backend: 'string', json: 'boolean' })
	const backend = getBackend(pickId(BACKEND_IDS, flags.backend, { fallback: 'kokoro', flag: 'backend' }))
	const available = await backend.voices()
	emit(flags.json, available, () => available.map((x) => `${x.id}  ${x.name}  ${x.language}`).join('\n'))
}

const printNormalized = async (args: string[]) => {
	const { flags } = parseFlags(args, SOURCE_ONLY_FLAGS)
	const source = await readSource(flags)
	const text = normalize(source.text)
	emit(flags.json, { ...source, text }, () => text)
}

const printChunks = async (args: string[]) => {
	const { flags } = parseFlags(args, SOURCE_ONLY_FLAGS)
	const source = await readSource(flags)
	const parts = chunk(normalize(source.text))
	emit(flags.json, parts, () => parts.map((part) => `${part.index}  ${part.text}`).join('\n'))
}

const SOURCE_USAGE = [
	'  --message <id>     transcript message id, as printed by `narrate list`',
	'  --file <path>      read the text from a file',
	'  --clipboard        read the text from the clipboard',
	'  (piped stdin is the default source when no flag is given)',
].join('\n')

const COMMANDS = {
	play: {
		summary: 'speak a source aloud, detaching so the shell returns immediately',
		usage: [
			'Usage: narrate play [source] [flags]',
			'',
			'Detaches by default: prints { pid, label, chunkTotal } and returns before the audio starts.',
			'',
			SOURCE_USAGE,
			'  --backend <id>     kokoro | say (default kokoro)',
			'  --voice <id>       voice id (default: the backend default)',
			'  --speed <n>        playback rate (default 1)',
			'  --start <index>    first chunk to speak (default 0)',
			'  --raw              skip markdown normalization',
			'  --foreground       narrate in this process and print the final state',
			'  --label <text>     label to record in state.json (set by the detach re-spawn)',
			'  --origin <origin>  origin to record in state.json (set by the detach re-spawn)',
		].join('\n'),
		run: play,
	},
	stop: {
		summary: 'stop the running narration',
		usage: 'Usage: narrate stop [--json]',
		run: stop,
	},
	status: {
		summary: 'print the current playback state',
		usage: 'Usage: narrate status [--json]',
		run: status,
	},
	seek: {
		summary: 'jump the running narration to a chunk index',
		usage: 'Usage: narrate seek <index> [--json]',
		run: seek,
	},
	rate: {
		summary: 'change the playback rate of the running narration, replaying only the current sentence',
		usage: 'Usage: narrate rate <speed> [--json]',
		run: rate,
	},
	list: {
		summary: 'list recent agent messages from the Claude Code transcripts',
		usage: [
			'Usage: narrate list [flags]',
			'',
			'  --project <cwd>    only messages whose cwd is under this path',
			'  --limit <n>        how many messages to return (default 50)',
		].join('\n'),
		run: list,
	},
	summarize: {
		summary: 'summarize a source with an LLM, optionally narrating the summary',
		usage: [
			'Usage: narrate summarize [source] [flags]',
			'',
			SOURCE_USAGE,
			'  --summarizer <id>  claude | opencode (default claude)',
			'  --play             narrate the summary, detaching as `narrate play` does',
			'  --backend/--voice/--speed  passed through to the narration',
		].join('\n'),
		run: summarize,
	},
	voices: {
		summary: 'list the voices a backend offers',
		usage: 'Usage: narrate voices [--backend kokoro|say] [--json]',
		run: voices,
	},
	normalize: {
		summary: 'print the speech-normalized text of a source',
		usage: ['Usage: narrate normalize [source] [flags]', '', SOURCE_USAGE].join('\n'),
		run: printNormalized,
	},
	chunks: {
		summary: 'print the numbered chunks a source would be split into',
		usage: ['Usage: narrate chunks [source] [flags]', '', SOURCE_USAGE].join('\n'),
		run: printChunks,
	},
}

type Command = keyof typeof COMMANDS

const isCommand = (value: string): value is Command => value in COMMANDS

const overview = () =>
	[
		'narrate — read agent responses aloud, locally.',
		'',
		'Usage: narrate <command> [flags]',
		'',
		...R.map(R.entries(COMMANDS), ([name, command]) => `  ${name.padEnd(10)} ${command.summary}`),
		'',
		'Every command takes --json. `narrate <command> --help` for its flags.',
	].join('\n')

const isHelp = (arg: string) => arg === '--help' || arg === '-h'

async function main() {
	const [command, ...rest] = process.argv.slice(2)

	if (!command || isHelp(command)) {
		console.log(overview())
		return
	}

	// Read before parsing, so a flag error still reports itself in the shape the caller asked for.
	const json = rest.includes('--json')

	try {
		if (!isCommand(command)) throw new Error(`unknown command: ${command}`)
		if (rest.some(isHelp)) console.log(COMMANDS[command].usage)
		else await COMMANDS[command].run(rest)
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error)
		console.error(json ? JSON.stringify({ error: reason }) : `error: ${reason}`)
		process.exit(1)
	}
}

runCLI(main)
