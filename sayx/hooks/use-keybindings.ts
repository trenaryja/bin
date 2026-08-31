// Maps key input to actions. Split out of App so the component stays a wiring layer.
import { useInput } from 'ink'
import type { Dispatch } from 'react'

import type { SayxConfig } from '../lib/types.ts'
import { VISUALIZATION_MODES } from '../lib/types.ts'
import type { Action, AppState } from '../lib/state.ts'
import { matchInput } from '../lib/keybindings.ts'
import { startSpeech } from '../lib/speech.ts'
import { getDeterministicPhrase, getRandomQuote } from '../lib/text-sources.ts'
import type { SayxActions } from './use-actions.ts'

type KeybindingsInput = {
	actions: SayxActions
	activeVoiceName: string | undefined
	config: SayxConfig
	dispatch: Dispatch<Action>
	exit: () => void
	filteredCount: number
	state: AppState
}

export function useSayxKeybindings(input: KeybindingsInput) {
	const { actions, activeVoiceName, config, dispatch, exit, filteredCount, state } = input

	useInput((char, key) => {
		// Text-entry focus and overlays swallow input; escape is the only way back out.
		if (state.focusArea === 'search' || state.focusArea === 'tags') {
			if (key.escape) dispatch({ type: 'FOCUS', area: 'list' })
			return
		}

		if (state.overlay === 'custom-text') {
			if (key.escape) dispatch({ type: 'DISMISS_OVERLAY' })
			return
		}

		const match = matchInput(char, key, config.keybindings)
		if (!match) return

		switch (match.action) {
			case 'quit':
				actions.stop()
				exit()
				return
			case 'help':
				dispatch({ type: 'SWITCH_TAB', tab: 'settings' })
				return
			case 'save':
				void actions.save()
				return
			case 'tabNext':
				dispatch({ type: 'TAB_NEXT' })
				return
			case 'tabPrev':
				dispatch({ type: 'TAB_PREV' })
				return
			case 'prevVoice':
				dispatch({ type: 'NAVIGATE_UP' })
				return
			case 'nextVoice':
				dispatch({ type: 'NAVIGATE_DOWN', voiceCount: filteredCount })
				return
			case 'play':
				actions.replay()
				return
			case 'stop':
				actions.stop()
				return
			case 'rateUp':
				actions.adjustRate(config.rateStep)
				return
			case 'rateDown':
				actions.adjustRate(-config.rateStep)
				return
			case 'rateUpBig':
				actions.adjustRate(config.rateBigStep)
				return
			case 'rateDownBig':
				actions.adjustRate(-config.rateBigStep)
				return
			case 'modeDeterministic': {
				const phrases = config.deterministicPhrases
				const index = state.textSource === 'deterministic' ? state.detIndex + 1 : 0
				const text = getDeterministicPhrase(phrases, index)
				dispatch({ type: 'CYCLE_DETERMINISTIC', phrases })
				if (activeVoiceName) actions.play(text, activeVoiceName)
				actions.showStatus(`Deterministic ${(index % phrases.length) + 1}/${phrases.length}`)
				return
			}
			case 'modeWikipedia':
				void actions.playWikipedia()
				return
			case 'modeQuote': {
				const text = getRandomQuote()
				dispatch({ type: 'PICK_QUOTE', voice: activeVoiceName ?? '' })
				if (activeVoiceName) startSpeech(activeVoiceName, state.rate, text)
				return
			}
			case 'modeCustom':
				dispatch({ type: 'OPEN_CUSTOM_TEXT' })
				return
			case 'toggleFavorite':
				if (activeVoiceName) dispatch({ type: 'TOGGLE_FAVORITE', voiceName: activeVoiceName })
				actions.scheduleStatusClear()
				return
			case 'cycleVisualization': {
				const index = VISUALIZATION_MODES.indexOf(state.visualization)
				const next = VISUALIZATION_MODES[(index + 1) % VISUALIZATION_MODES.length]!
				dispatch({ type: 'CYCLE_VISUALIZATION' })
				actions.showStatus(`Visualization: ${next}`)
				return
			}
			case 'tagFilter':
				dispatch({ type: 'FOCUS', area: 'tags' })
				return
			case 'search':
				dispatch({ type: 'FOCUS', area: 'search' })
		}
	})
}
