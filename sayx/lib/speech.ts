import { spawn, type Subprocess } from 'bun'

let currentProcess: Subprocess | null = null
const listeners = new Set<() => void>()

export function isPlaying(): boolean {
	return currentProcess !== null
}

export function onPlaybackEnd(cb: () => void): () => void {
	listeners.add(cb)
	return () => {
		listeners.delete(cb)
	}
}

function notifyEnd(): void {
	for (const cb of listeners) cb()
}

export function stopSpeech(): void {
	if (!currentProcess) return
	currentProcess.kill()
	currentProcess = null
}

export function startSpeech(voice: string, rate: number, text: string): void {
	stopSpeech()

	const proc = spawn(['say', '-v', voice, '-r', String(rate), text], {
		stdout: 'ignore',
		stderr: 'ignore',
	})

	currentProcess = proc

	proc.exited.then(() => {
		if (currentProcess === proc) {
			currentProcess = null
			notifyEnd()
		}
	})
}
