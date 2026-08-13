import { Box, useApp } from 'ink'
import React, { useEffect, useReducer } from 'react'

import type { SayxConfig, Voice } from '../lib/types.ts'
import { isPlaying as isSpeechPlaying, onPlaybackEnd, stopSpeech } from '../lib/speech.ts'
import type { AppState } from '../lib/state.ts'
import { createInitialState, reduce } from '../lib/state.ts'
import { filterVoices, getAllTags, getVoiceMeta } from '../lib/voices.ts'
import { useSayxActions } from '../hooks/use-actions.ts'
import { useSayxKeybindings } from '../hooks/use-keybindings.ts'

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

// Everything the render reads that isn't state — kept out of App so the component body
// is wiring and layout rather than computation.
function deriveView(allVoices: Voice[], config: SayxConfig, state: AppState) {
	const filteredVoices = filterVoices(allVoices, {
		searchQuery: state.searchQuery || undefined,
		tags: state.activeTags.length > 0 ? state.activeTags : undefined,
		config,
	})

	const activeVoiceName =
		state.activeTab === 'favorites' ? state.favorites[state.favCursor]?.voice : filteredVoices[state.voiceCursor]?.name
	const activeVoice = activeVoiceName ? allVoices.find((v) => v.name === activeVoiceName) : undefined

	return {
		activeMeta: activeVoice ? getVoiceMeta(activeVoice.name, config, activeVoice) : undefined,
		activeVoice,
		activeVoiceName,
		allTags: getAllTags(config, allVoices),
		filteredVoices,
		isFav: activeVoice ? state.favorites.some((f) => f.voice === activeVoice.name) : false,
	}
}

export function App({ allVoices, config, configPath }: AppProps) {
	const { exit } = useApp()
	const [s, dispatch] = useReducer(reduce, config, createInitialState)

	const { activeMeta, activeVoice, activeVoiceName, allTags, filteredVoices, isFav } = deriveView(allVoices, config, s)

	// ── Behavior ──

	const actions = useSayxActions({ activeVoiceName, config, configPath, dispatch, state: s })

	useSayxKeybindings({
		actions,
		activeVoiceName,
		config,
		dispatch,
		exit,
		filteredCount: filteredVoices.length,
		state: s,
	})

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

	// ── Render ──

	if (s.overlay === 'custom-text') {
		return (
			<CustomTextInput
				value={s.customInput}
				onChange={(v) => dispatch({ type: 'SET_CUSTOM_INPUT', value: v })}
				onSubmit={(v) => {
					dispatch({ type: 'SUBMIT_CUSTOM_TEXT', text: v })
					if (v && activeVoiceName) actions.play(v)
				}}
			/>
		)
	}

	const playbackProps = {
		rate: s.rate,
		config,
		textSource: s.textSource,
		isPlaying: s.playing,
		playCount: s.playCount,
		playingVoice: s.playingVoice,
		selectedVoice: activeVoice,
		selectedMeta: activeMeta,
		isFavorite: isFav,
		currentText: s.currentText,
		statusMsg: s.statusMsg,
		visualization: s.visualization,
	}

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
