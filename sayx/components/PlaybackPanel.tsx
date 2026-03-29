import { Box, Text } from 'ink'
import React from 'react'

import type { SayxConfig, TextSource, Voice, VoiceMeta } from '../lib/types.ts'

import { TextSourceSelector } from './TextSourceSelector.tsx'
import { Visualizer } from './Visualizer.tsx'
import { WordHighlighter } from './WordHighlighter.tsx'

type PlaybackPanelProps = {
	config: SayxConfig
	currentText: string
	isFavorite: boolean
	isPlaying: boolean
	playCount: number
	playingVoice: string
	rate: number
	selectedMeta: VoiceMeta | undefined
	selectedVoice: Voice | undefined
	statusMsg: string
	textSource: TextSource
}

export function PlaybackPanel({
	rate,
	config,
	textSource,
	isPlaying,
	playCount,
	playingVoice,
	selectedVoice,
	selectedMeta,
	isFavorite,
	currentText,
	statusMsg,
}: PlaybackPanelProps) {
	const { rateMin, rateMax } = config
	const pct = (rate - rateMin) / (rateMax - rateMin)
	const barWidth = 20
	const filled = Math.round(pct * barWidth)
	const rateBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)

	return (
		<Box flexDirection='column' marginLeft={3} width={36}>
			{/* Rate */}
			<Box flexDirection='column' marginBottom={1}>
				<Text bold>{'Rate'}</Text>
				<Box>
					<Text color='yellow'>{rate}</Text>
					<Text dimColor>{' wpm'}</Text>
				</Box>
				<Text color='green'>{rateBar}</Text>
				<Text dimColor>
					{'-/+ fine · [/] coarse · '}{rateMin}{'–'}{rateMax}
				</Text>
			</Box>

			{/* Playback status + visualizer */}
			<Box flexDirection='column' marginBottom={1}>
				<Text bold>{'Playback'}</Text>
				{isPlaying ? (
					<>
						<Text color='green'>{'▶ Playing: '}{playingVoice}</Text>
						<Visualizer active />
					</>
				) : (
					<>
						<Text dimColor>{'■ Stopped'}</Text>
						<Visualizer active={false} />
					</>
				)}
			</Box>

			{/* Selected voice info + tags */}
			{selectedVoice && (
				<Box flexDirection='column' marginBottom={1}>
					<Text bold>{'Selected'}</Text>
					<Text>
						{selectedVoice.name}{' '}
						<Text dimColor>{'('}{selectedVoice.locale}{')'}</Text>
					</Text>
					{selectedMeta?.bio && (
						<Text dimColor italic wrap='wrap'>
							{selectedMeta.bio}
						</Text>
					)}
					{selectedMeta?.tags.length && (
						<Box flexWrap='wrap' gap={1} marginTop={0}>
							{selectedMeta.tags.map((tag) => (
								<Text key={tag} color='blue'>{'['}{tag}{']'}</Text>
							))}
						</Box>
					)}
					<Text>
						{isFavorite ? (
							<Text color='yellow'>{'★ Favorite'}</Text>
						) : (
							<Text dimColor>{'f to favorite'}</Text>
						)}
					</Text>
				</Box>
			)}

			{/* Text source selector */}
			<Box flexDirection='column' marginBottom={1}>
				<TextSourceSelector activeSource={textSource} bindings={config.keybindings} />
			</Box>

			{currentText && (
				<Box flexDirection='column' marginBottom={1}>
					<Text bold>{isPlaying ? 'Speaking' : 'Text'}</Text>
					<WordHighlighter text={currentText} rate={rate} active={isPlaying} playKey={`${playCount}`} delay={config.highlightDelay} />
				</Box>
			)}

			{/* Status message */}
			{statusMsg ? <Text color='magenta'>{statusMsg}</Text> : null}
		</Box>
	)
}
