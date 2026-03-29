import { Box, useApp, useInput } from 'ink'
import React, { useEffect, useReducer, useRef } from 'react'

import type { SayxConfig, Voice } from '../lib/types.ts'
import { saveConfig } from '../lib/config.ts'
import { matchInput } from '../lib/keybindings.ts'
import { isPlaying as isSpeechPlaying, onPlaybackEnd, startSpeech, stopSpeech } from '../lib/speech.ts'
import { createInitialState, reduce } from '../lib/state.ts'
import { fetchWikipediaSummary, getDeterministicPhrase, getRandomQuote } from '../lib/text-sources.ts'
import { filterVoices, getAllTags, getVoiceMeta } from '../lib/voices.ts'

import { CustomTextInput } from './CustomTextInput.tsx'
import { FavoritesList } from './FavoritesList.tsx'
import { PlaybackPanel } from './PlaybackPanel.tsx'
import { SearchBar } from './SearchBar.tsx'
import { SettingsView } from './SettingsView.tsx'
import { StatusBar } from './StatusBar.tsx'
import { TabBar } from './TabBar.tsx'
import { TagBox } from './TagBox.tsx'
import { VoiceList } from './VoiceList.tsx'

type AppProps = {
	allVoices: Voice[]
	config: SayxConfig
	configPath: string
}

export function App({ allVoices, config, configPath }: AppProps) {
	const { exit } = useApp()
	const [s, dispatch] = useReducer(reduce, config, createInitialState)
	const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// ── Derived data ──

	const filteredVoices = filterVoices(allVoices, { searchQuery: s.searchQuery || undefined, tags: s.activeTags.length > 0 ? s.activeTags : undefined, config })

	const allTags = getAllTags(config, allVoices)

	const activeVoiceName = s.activeTab === 'favorites' ? s.favorites[s.favCursor]?.voice : filteredVoices[s.voiceCursor]?.name
	const activeVoice = activeVoiceName ? allVoices.find((v) => v.name === activeVoiceName) : undefined
	const activeMeta = activeVoice ? getVoiceMeta(activeVoice.name, config, activeVoice) : undefined
	const isFav = activeVoice ? s.favorites.some((f) => f.voice === activeVoice.name) : false

	// ── Side-effect helpers ──

	function showStatus(msg: string) {
		dispatch({ type: 'STATUS', msg })
		if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
		statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), 3000)
	}

	function play(text: string, voice?: string) {
		const v = voice ?? activeVoiceName
		if (!v) return
		startSpeech(v, s.rate, text)
		dispatch({ type: 'PLAY_TEXT', text, voice: v })
	}

	function replay(voice?: string) {
		const v = voice ?? activeVoiceName
		if (!v || !s.currentText) return
		startSpeech(v, s.rate, s.currentText)
		dispatch({ type: 'PLAY_TEXT', text: s.currentText, voice: v })
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
		const next = Math.max(config.rateMin, Math.min(config.rateMax, s.rate + delta))
		dispatch({ type: 'ADJUST_RATE', delta, min: config.rateMin, max: config.rateMax })
		if (s.playing && s.playingVoice) startSpeech(s.playingVoice, next, s.currentText)
		showStatus(`Rate: ${next} wpm`)
	}

	async function save() {
		try {
			await saveConfig(configPath, { ...config, favorites: s.favorites })
			dispatch({ type: 'SAVE_DONE', configPath })
		} catch {
			dispatch({ type: 'SAVE_FAILED' })
		}
		if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
		statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), 3000)
	}

	// ── Effects ──

	useEffect(() => {
		return onPlaybackEnd(() => dispatch({ type: 'PLAYBACK_ENDED' }))
	}, [])

	useEffect(() => {
		if (!s.playing) return
		const interval = setInterval(() => {
			if (!isSpeechPlaying()) dispatch({ type: 'PLAYBACK_ENDED' })
		}, 300)
		return () => clearInterval(interval)
	}, [s.playing])

	useEffect(() => () => stopSpeech(), [])

	useEffect(() => {
		dispatch({ type: 'CLAMP_CURSORS', voiceCount: filteredVoices.length, favCount: s.favorites.length })
	}, [filteredVoices.length, s.favorites.length])

	// ── Input handling ──

	useInput((input, key) => {
		if (s.focusArea === 'search' || s.focusArea === 'tags') {
			if (key.escape) { dispatch({ type: 'FOCUS', area: 'list' }); return }
			return
		}

		if (s.overlay === 'custom-text') {
			if (key.escape) dispatch({ type: 'DISMISS_OVERLAY' })
			return
		}

		const match = matchInput(input, key, config.keybindings)
		if (!match) return

		switch (match.action) {
			case 'quit': stop(); exit(); return
			case 'help': dispatch({ type: 'SWITCH_TAB', tab: 'settings' }); return
			case 'save': save(); return
			case 'tabNext': dispatch({ type: 'TAB_NEXT' }); return
			case 'tabPrev': dispatch({ type: 'TAB_PREV' }); return
			case 'prevVoice': dispatch({ type: 'NAVIGATE_UP' }); return
			case 'nextVoice': dispatch({ type: 'NAVIGATE_DOWN', voiceCount: filteredVoices.length }); return
			case 'play': replay(); return
			case 'stop': stop(); return
			case 'rateUp': adjustRate(config.rateStep); return
			case 'rateDown': adjustRate(-config.rateStep); return
			case 'rateUpBig': adjustRate(config.rateBigStep); return
			case 'rateDownBig': adjustRate(-config.rateBigStep); return
			case 'modeDeterministic': {
				const idx = s.textSource === 'deterministic' ? s.detIndex + 1 : 0
				const text = getDeterministicPhrase(config.deterministicPhrases, idx)
				dispatch({ type: 'CYCLE_DETERMINISTIC', phrases: config.deterministicPhrases })
				if (activeVoiceName) play(text, activeVoiceName)
				showStatus(`Deterministic ${(idx % config.deterministicPhrases.length) + 1}/${config.deterministicPhrases.length}`)
				return
			}
			case 'modeWikipedia': playWikipedia(); return
			case 'modeQuote': {
				const text = getRandomQuote()
				dispatch({ type: 'PICK_QUOTE', voice: activeVoiceName ?? '' })
				if (activeVoiceName) startSpeech(activeVoiceName, s.rate, text)
				return
			}
			case 'modeCustom': dispatch({ type: 'OPEN_CUSTOM_TEXT' }); return
			case 'toggleFavorite': {
				if (activeVoiceName) dispatch({ type: 'TOGGLE_FAVORITE', voiceName: activeVoiceName })
				if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
				statusTimerRef.current = setTimeout(() => dispatch({ type: 'CLEAR_STATUS' }), 3000)
				return
			}
			case 'viewFavorites': dispatch({ type: 'SWITCH_TAB', tab: 'favorites' }); return
			case 'tagFilter': dispatch({ type: 'FOCUS', area: 'tags' }); return
			case 'search': dispatch({ type: 'FOCUS', area: 'search' }); return
		}
	})

	// ── Render ──

	if (s.overlay === 'custom-text') {
		return (
			<CustomTextInput
				value={s.customInput}
				onChange={(v) => dispatch({ type: 'SET_CUSTOM_INPUT', value: v })}
				onSubmit={(v) => {
					dispatch({ type: 'SUBMIT_CUSTOM_TEXT', text: v })
					if (v && activeVoiceName) play(v)
				}}
			/>
		)
	}

	const playbackProps = { rate: s.rate, config, textSource: s.textSource, isPlaying: s.playing, playCount: s.playCount, playingVoice: s.playingVoice, selectedVoice: activeVoice, selectedMeta: activeMeta, isFavorite: isFav, currentText: s.currentText, statusMsg: s.statusMsg }

	return (
		<Box flexDirection='column' paddingX={1}>
			<TabBar activeTab={s.activeTab} dirty={s.dirty} />
			<StatusBar bindings={config.keybindings} dirty={s.dirty} />

			{s.activeTab === 'voices' && (
				<>
					<SearchBar
						value={s.searchQuery}
						onChange={(v) => dispatch({ type: 'SET_SEARCH', query: v })}
						focused={s.focusArea === 'search'}
						resultCount={filteredVoices.length}
						onRequestFocusDown={() => dispatch({ type: 'FOCUS', area: 'tags' })}
					/>
					<TagBox
						allTags={allTags}
						activeTags={s.activeTags}
						focused={s.focusArea === 'tags'}
						onTagsChange={(tags) => dispatch({ type: 'SET_TAGS', tags })}
						onRequestFocusUp={() => dispatch({ type: 'FOCUS', area: 'search' })}
						onRequestFocusDown={() => dispatch({ type: 'FOCUS', area: 'list' })}
					/>
				</>
			)}

			{s.activeTab === 'voices' && (
				<Box>
					<VoiceList
						voices={filteredVoices}
						cursor={s.voiceCursor}
						scrollOffset={s.scrollOffset}
						favorites={s.favorites}
						playingVoice={s.playingVoice}
						isPlaying={s.playing}
						activeTags={s.activeTags}
					/>
					<PlaybackPanel {...playbackProps} />
				</Box>
			)}

			{s.activeTab === 'favorites' && (
				<Box>
					<FavoritesList
						favorites={s.favorites}
						config={config}
						cursor={s.favCursor}
						onRemove={(i) => dispatch({ type: 'REMOVE_FAVORITE', index: i })}
					/>
					{s.favorites.length > 0 && <PlaybackPanel {...playbackProps} />}
				</Box>
			)}

			{s.activeTab === 'settings' && <SettingsView config={config} configPath={configPath} />}
		</Box>
	)
}
