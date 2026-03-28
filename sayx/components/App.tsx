import { Box, useApp, useInput } from 'ink'
import React, { useEffect, useRef, useState } from 'react'

import type { Favorite, SayxConfig, Tab, TextSource, Voice } from '../lib/types.ts'
import { saveConfig } from '../lib/config.ts'
import { matchInput } from '../lib/keybindings.ts'
import { isPlaying as isSpeechPlaying, onPlaybackEnd, startSpeech, stopSpeech } from '../lib/speech.ts'
import { fetchWikipediaSummary, getDeterministicPhrase, getRandomQuote } from '../lib/text-sources.ts'
import { filterVoices, getAllTags, getVoiceMeta } from '../lib/voices.ts'

import { CustomTextInput } from './CustomTextInput.tsx'
import { FavoritesList } from './FavoritesList.tsx'
import { HelpOverlay } from './HelpOverlay.tsx'
import { LanguageFilter } from './LanguageFilter.tsx'
import { PlaybackPanel } from './PlaybackPanel.tsx'
import { SearchOverlay } from './SearchOverlay.tsx'
import { SettingsView } from './SettingsView.tsx'
import { StatusBar } from './StatusBar.tsx'
import { TabBar } from './TabBar.tsx'
import { TagFilter } from './TagFilter.tsx'
import { VoiceList, VISIBLE_ROWS } from './VoiceList.tsx'

type Overlay = 'custom-text' | 'help' | 'language-filter' | 'search' | 'tag-filter' | null

type AppProps = {
	allVoices: Voice[]
	config: SayxConfig
	configPath: string
}

export function App({ allVoices, config, configPath }: AppProps) {
	const { exit } = useApp()

	// Tab state
	const [activeTab, setActiveTab] = useState<Tab>(config.favorites.length > 0 ? 'favorites' : 'voices')
	const TABS: Tab[] = ['voices', 'favorites', 'settings']

	// Voice browsing state
	const [langFilter, setLangFilter] = useState(config.defaultLanguage)
	const [activeTags, setActiveTags] = useState<string[]>([])
	const [searchQuery, setSearchQuery] = useState('')
	const [voiceCursor, setVoiceCursor] = useState(0)
	const [scrollOffset, setScrollOffset] = useState(0)

	// Favorites cursor (separate from voice cursor)
	const [favCursor, setFavCursor] = useState(0)

	// Playback state
	const [rate, setRate] = useState(config.defaultRate)
	const [textSource, setTextSource] = useState<TextSource>('deterministic')
	const [customText, setCustomText] = useState('')
	const [playing, setPlaying] = useState(false)
	const [playingVoice, setPlayingVoice] = useState('')
	const [currentText, setCurrentText] = useState(getDeterministicPhrase(config.deterministicPhrases, 0))
	const [detIndex, setDetIndex] = useState(0)

	// Favorites + dirty state
	const [favorites, setFavorites] = useState<Favorite[]>(config.favorites)
	const [dirty, setDirty] = useState(false)

	// Overlay
	const [overlay, setOverlay] = useState<Overlay>(null)
	const [langInput, setLangInput] = useState('')
	const [searchInput, setSearchInput] = useState('')
	const [customInput, setCustomInput] = useState('')

	// Status
	const [statusMsg, setStatusMsg] = useState('')
	const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Derived data
	const filteredVoices = filterVoices(allVoices, {
		language: langFilter || undefined,
		searchQuery: searchQuery || undefined,
		tags: activeTags.length > 0 ? activeTags : undefined,
		config,
	})

	const languages = [...new Set(allVoices.map((v) => v.language))].sort()
	const allTags = getAllTags(config)

	// Active voice depends on which tab we're on
	function getActiveVoiceName(): string | undefined {
		if (activeTab === 'favorites') {
			return favorites[favCursor]?.voice
		}
		return filteredVoices[voiceCursor]?.name
	}

	function getActiveVoice(): Voice | undefined {
		const name = getActiveVoiceName()
		if (!name) return undefined
		return allVoices.find((v) => v.name === name)
	}

	const activeVoice = getActiveVoice()
	const activeMeta = activeVoice ? getVoiceMeta(activeVoice.name, config) : undefined
	const isFav = activeVoice ? favorites.some((f) => f.voice === activeVoice.name) : false

	// ── Helpers ──

	function showStatus(msg: string) {
		setStatusMsg(msg)
		if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
		statusTimerRef.current = setTimeout(() => setStatusMsg(''), 3000)
	}

	function playText(text: string, voiceName?: string) {
		const voice = voiceName ?? getActiveVoiceName()
		if (!voice) return
		setCurrentText(text)
		startSpeech(voice, rate, text)
		setPlaying(true)
		setPlayingVoice(voice)
	}

	function replayCurrentText(voiceName?: string) {
		const voice = voiceName ?? getActiveVoiceName()
		if (!voice || !currentText) return
		startSpeech(voice, rate, currentText)
		setPlaying(true)
		setPlayingVoice(voice)
	}

	function stop() {
		stopSpeech()
		setPlaying(false)
		setPlayingVoice('')
	}

	async function fetchAndPlayWikipedia() {
		if (!getActiveVoiceName()) return

		setTextSource('wikipedia')
		showStatus('Fetching from Wikipedia…')

		try {
			const text = await fetchWikipediaSummary()
			playText(text)
			showStatus('Wikipedia article loaded')
		} catch {
			showStatus('Could not fetch from Wikipedia')
		}
	}

	function pickAndPlayQuote() {
		setTextSource('quote')
		const text = getRandomQuote()
		playText(text)
	}

	function cycleAndPlayDeterministic() {
		setTextSource('deterministic')
		const nextIndex = textSource === 'deterministic' ? detIndex + 1 : 0
		setDetIndex(nextIndex)
		const text = getDeterministicPhrase(config.deterministicPhrases, nextIndex)
		playText(text)
		const num = (nextIndex % config.deterministicPhrases.length) + 1
		showStatus(`Deterministic ${num}/${config.deterministicPhrases.length}`)
	}

	function toggleFavorite() {
		const voiceName = getActiveVoiceName()
		if (!voiceName) return
		const idx = favorites.findIndex((f) => f.voice === voiceName)

		if (idx !== -1) {
			setFavorites((prev) => prev.filter((_, i) => i !== idx))
			showStatus(`Removed ${voiceName} from favorites`)
		} else {
			setFavorites((prev) => [...prev, { voice: voiceName, rate }])
			showStatus(`Added ${voiceName} @ ${rate} wpm`)
		}

		setDirty(true)
	}

	function removeFavorite(index: number) {
		setFavorites((prev) => prev.filter((_, i) => i !== index))
		setDirty(true)
		showStatus('Removed from favorites')
	}

	async function persistConfig() {
		const updated = { ...config, favorites }
		try {
			await saveConfig(configPath, updated)
			setDirty(false)
			showStatus(`Saved to ${configPath}`)
		} catch {
			showStatus('Failed to save config')
		}
	}

	function adjustRate(delta: number) {
		setRate((r) => {
			const next = Math.max(config.rateMin, Math.min(config.rateMax, r + delta))

			if (playing && playingVoice) {
				startSpeech(playingVoice, next, currentText)
			}

			return next
		})
	}

	function navigateUp() {
		if (activeTab === 'voices') {
			setVoiceCursor((c) => Math.max(0, c - 1))
		} else if (activeTab === 'favorites') {
			setFavCursor((c) => Math.max(0, c - 1))
		}
	}

	function navigateDown() {
		if (activeTab === 'voices') {
			setVoiceCursor((c) => Math.min(filteredVoices.length - 1, c + 1))
		} else if (activeTab === 'favorites') {
			setFavCursor((c) => Math.min(favorites.length - 1, c + 1))
		}
	}

	// ── Effects ──

	useEffect(() => {
		onPlaybackEnd(() => {
			setPlaying(false)
			setPlayingVoice('')
		})
	}, [])

	useEffect(() => {
		if (!playing) return
		const interval = setInterval(() => {
			if (!isSpeechPlaying()) {
				setPlaying(false)
				setPlayingVoice('')
			}
		}, 300)
		return () => clearInterval(interval)
	}, [playing])

	useEffect(() => {
		return () => stopSpeech()
	}, [])

	useEffect(() => {
		if (voiceCursor >= filteredVoices.length) {
			setVoiceCursor(Math.max(0, filteredVoices.length - 1))
		}
	}, [filteredVoices.length])

	useEffect(() => {
		if (favCursor >= favorites.length) {
			setFavCursor(Math.max(0, favorites.length - 1))
		}
	}, [favorites.length])

	useEffect(() => {
		if (voiceCursor < scrollOffset) setScrollOffset(voiceCursor)
		else if (voiceCursor >= scrollOffset + VISIBLE_ROWS) setScrollOffset(voiceCursor - VISIBLE_ROWS + 1)
	}, [voiceCursor])

	// ── Input handling ──

	useInput((input, key) => {
		if (key.escape) {
			if (overlay) {
				setOverlay(null)
				return
			}
		}

		if (overlay === 'help') {
			setOverlay(null)
			return
		}

		if (overlay === 'search' || overlay === 'language-filter' || overlay === 'custom-text') {
			if (key.escape) setOverlay(null)
			return
		}

		if (overlay === 'tag-filter') {
			if (key.escape) setOverlay(null)
			return
		}

		const match = matchInput(input, key, config.keybindings)
		if (!match) return

		switch (match.action) {
			case 'quit':
				stop()
				exit()
				return

			case 'help':
				setOverlay('help')
				return

			case 'save':
				persistConfig()
				return

			case 'tabNext': {
				const idx = TABS.indexOf(activeTab)
				setActiveTab(TABS[(idx + 1) % TABS.length]!)
				return
			}

			case 'tabPrev': {
				const idx = TABS.indexOf(activeTab)
				setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length]!)
				return
			}

			case 'prevVoice':
				navigateUp()
				return

			case 'nextVoice':
				navigateDown()
				return

			case 'play':
				replayCurrentText()
				return

			case 'stop':
				stop()
				return

			case 'rateUp':
				adjustRate(config.rateStep)
				showStatus(`Rate: ${Math.min(config.rateMax, rate + config.rateStep)} wpm`)
				return

			case 'rateDown':
				adjustRate(-config.rateStep)
				showStatus(`Rate: ${Math.max(config.rateMin, rate - config.rateStep)} wpm`)
				return

			case 'rateUpBig':
				adjustRate(config.rateBigStep)
				showStatus(`Rate: ${Math.min(config.rateMax, rate + config.rateBigStep)} wpm`)
				return

			case 'rateDownBig':
				adjustRate(-config.rateBigStep)
				showStatus(`Rate: ${Math.max(config.rateMin, rate - config.rateBigStep)} wpm`)
				return

			case 'modeDeterministic':
				cycleAndPlayDeterministic()
				return

			case 'modeWikipedia':
				fetchAndPlayWikipedia()
				return

			case 'modeQuote':
				pickAndPlayQuote()
				return

			case 'modeCustom':
				setOverlay('custom-text')
				setCustomInput(customText)
				return

			case 'toggleFavorite':
				toggleFavorite()
				return

			case 'viewFavorites':
				setActiveTab('favorites')
				return

			case 'languageFilter':
				setOverlay('language-filter')
				setLangInput(langFilter)
				return

			case 'tagFilter':
				setOverlay('tag-filter')
				return

			case 'search':
				setOverlay('search')
				setSearchInput(searchQuery)
				return
		}
	})

	// ── Render ──

	if (overlay === 'help') {
		return <HelpOverlay bindings={config.keybindings} />
	}

	if (overlay === 'search') {
		return (
			<SearchOverlay
				value={searchInput}
				onChange={setSearchInput}
				onSubmit={() => {
					setSearchQuery(searchInput)
					setVoiceCursor(0)
					setScrollOffset(0)
					setOverlay(null)
					showStatus(searchInput ? `Search: "${searchInput}"` : 'Search cleared')
				}}
			/>
		)
	}

	if (overlay === 'language-filter') {
		return (
			<LanguageFilter
				value={langInput}
				onChange={setLangInput}
				onSubmit={(val) => {
					setLangFilter(val.trim().toLowerCase())
					setVoiceCursor(0)
					setScrollOffset(0)
					setOverlay(null)
					showStatus(val.trim() ? `Filter: ${val.trim()}` : 'Showing all languages')
				}}
				languages={languages}
			/>
		)
	}

	if (overlay === 'custom-text') {
		return (
			<CustomTextInput
				value={customInput}
				onChange={setCustomInput}
				onSubmit={(val) => {
					setCustomText(val)
					setTextSource('custom')
					setCurrentText(val)
					setOverlay(null)
					showStatus('Text: custom')
					if (val) playText(val)
				}}
			/>
		)
	}

	if (overlay === 'tag-filter') {
		return (
			<TagFilter
				allTags={allTags}
				activeTags={activeTags}
				onApply={(tags) => {
					setActiveTags(tags)
					setVoiceCursor(0)
					setScrollOffset(0)
					setOverlay(null)
					showStatus(tags.length > 0 ? `Tags: ${tags.join(', ')}` : 'Tags cleared')
				}}
			/>
		)
	}

	// Shared PlaybackPanel props
	const playbackProps = {
		rate,
		config,
		textSource,
		isPlaying: playing,
		playingVoice,
		selectedVoice: activeVoice,
		selectedMeta: activeMeta,
		isFavorite: isFav,
		currentText,
		statusMsg,
	}

	return (
		<Box flexDirection='column' paddingX={1}>
			<TabBar activeTab={activeTab} dirty={dirty} />
			<StatusBar bindings={config.keybindings} dirty={dirty} />

			{activeTab === 'voices' && (
				<Box>
					<VoiceList
						voices={filteredVoices}
						cursor={voiceCursor}
						scrollOffset={scrollOffset}
						favorites={favorites}
						playingVoice={playingVoice}
						isPlaying={playing}
						langFilter={langFilter}
						activeTags={activeTags}
					/>
					<PlaybackPanel {...playbackProps} />
				</Box>
			)}

			{activeTab === 'favorites' && (
				<Box>
					<FavoritesList
						favorites={favorites}
						config={config}
						cursor={favCursor}
						onCursorChange={setFavCursor}
						onRemove={removeFavorite}
					/>
					<PlaybackPanel {...playbackProps} />
				</Box>
			)}

			{activeTab === 'settings' && <SettingsView config={config} configPath={configPath} />}
		</Box>
	)
}
