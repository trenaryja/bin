// Side-effecting actions shared by the keybinding handler and the render tree.
// Kept out of App so the component stays a wiring layer.
import type { Dispatch } from 'react'
import { useRef } from 'react'

import type { SayxConfig } from '../lib/types.ts'
import type { Action, AppState } from '../lib/state.ts'
import { saveConfig } from '../lib/config.ts'
import { startSpeech, stopSpeech } from '../lib/speech.ts'
import { fetchWikipediaSummary } from '../lib/text-sources.ts'

const STATUS_CLEAR_MS = 3000

type ActionsInput = {
	activeVoiceName: string | undefined
	config: SayxConfig
	configPath: string
	dispatch: Dispatch<Action>
	state: AppState
}

export function useSayxActions({ activeVoiceName, config, configPath, dispatch, state }: ActionsInput) {
	const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	function scheduleStatusClear() {
		if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
		statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), STATUS_CLEAR_MS)
	}

	function showStatus(msg: string) {
		dispatch({ type: 'STATUS', msg })
		scheduleStatusClear()
	}

	function play(text: string, voice?: string) {
		const target = voice ?? activeVoiceName
		if (!target) return
		startSpeech(target, state.rate, text)
		dispatch({ type: 'PLAY_TEXT', text, voice: target })
	}

	function replay(voice?: string) {
		const target = voice ?? activeVoiceName
		if (!target || !state.currentText) return
		startSpeech(target, state.rate, state.currentText)
		dispatch({ type: 'PLAY_TEXT', text: state.currentText, voice: target })
	}

	function stop() {
		stopSpeech()
		dispatch({ type: 'STOP' })
	}

	async function playWikipedia() {
		if (!activeVoiceName) return
		showStatus('Fetching from Wikipedia…')

		try {
			const text = await fetchWikipediaSummary()
			play(text)
			showStatus('Wikipedia article loaded')
		} catch {
			showStatus('Could not fetch from Wikipedia')
		}
	}

	function adjustRate(delta: number) {
		const next = Math.max(config.rateMin, Math.min(config.rateMax, state.rate + delta))
		dispatch({ type: 'ADJUST_RATE', delta, min: config.rateMin, max: config.rateMax })
		if (state.playing && state.playingVoice) startSpeech(state.playingVoice, next, state.currentText)
		showStatus(`Rate: ${next} wpm`)
	}

	async function save() {
		try {
			await saveConfig(configPath, {
				...config,
				favorites: state.favorites,
				defaultVisualization: state.visualization,
			})
			dispatch({ type: 'SAVE_DONE', configPath })
		} catch {
			dispatch({ type: 'SAVE_FAILED' })
		}

		scheduleStatusClear()
	}

	return { adjustRate, play, playWikipedia, replay, save, scheduleStatusClear, showStatus, stop }
}

export type SayxActions = ReturnType<typeof useSayxActions>
