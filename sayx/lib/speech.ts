import { spawn, type Subprocess } from 'bun'

let currentProcess: Subprocess | null = null
let onStopCallback: (() => void) | null = null

export function isPlaying(): boolean {
	return currentProcess !== null
}

export function onPlaybackEnd(cb: () => void): void {
	onStopCallback = cb
}

export function stopSpeech(): void {
	if (currentProcess) {
		currentProcess.kill()
		currentProcess = null
	}
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
			onStopCallback?.()
		}
	})
}
