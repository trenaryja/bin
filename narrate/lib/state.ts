import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PlaybackState } from './types'

const ROOT = process.env.NARRATE_STATE_DIR ?? join(homedir(), '.local', 'state', 'narrate')

export const paths = {
	root: ROOT,
	state: join(ROOT, 'state.json'),
	pid: join(ROOT, 'pid'),
	stop: join(ROOT, 'stop'),
	seek: join(ROOT, 'seek'),
	audio: join(ROOT, 'audio'),
	scratch: join(ROOT, 'scratch'),
	log: join(ROOT, 'runner.log'),
}

export const ensureStateDirs = () => {
	for (const dir of [paths.root, paths.audio, paths.scratch]) mkdirSync(dir, { recursive: true })
}

export const writeState = (state: PlaybackState) =>
	Bun.write(paths.state, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))

export const readState = async () => {
	const file = Bun.file(paths.state)
	if (!(await file.exists())) return null
	return (await file.json()) as PlaybackState
}

export const requestStop = () => Bun.write(paths.stop, '')
export const requestSeek = (index: number) => Bun.write(paths.seek, String(index))
