import { Box, Text } from 'ink'
import React from 'react'

import type { Favorite, Voice } from '../lib/types.ts'

import { VISIBLE_ROWS } from '../lib/state.ts'

import { VoiceCard } from './VoiceCard.tsx'

type VoiceListProps = {
	cursor: number
	favorites: Favorite[]
	isPlaying: boolean
	playingVoice: string
	scrollOffset: number
	voices: Voice[]
}

export function VoiceList({ voices, cursor, scrollOffset, favorites, playingVoice, isPlaying }: VoiceListProps) {
	const visibleVoices = voices.slice(scrollOffset, scrollOffset + VISIBLE_ROWS)
	const hasMore = voices.length > VISIBLE_ROWS

	return (
		<Box flexDirection='column' width={44}>
			<Box marginBottom={1} gap={1}>
				<Text bold>Voices ({voices.length})</Text>
			</Box>

			{visibleVoices.map((voice, i) => {
				const idx = scrollOffset + i
				return (
					<VoiceCard
						key={`${voice.name}-${voice.locale}-${idx}`}
						voice={voice}
						isSelected={idx === cursor}
						isFavorite={favorites.some((f) => f.voice === voice.name)}
						isCurrentlyPlaying={playingVoice === voice.name && isPlaying}
					/>
				)
			})}

			{voices.length === 0 && <Text dimColor>No voices match</Text>}

			{hasMore && (
				<Box marginTop={1}>
					<Text dimColor>
						{scrollOffset > 0 ? '↑ ' : '  '}
						{scrollOffset + VISIBLE_ROWS < voices.length ? '↓ ' : '  '}
						{cursor + 1}/{voices.length}
					</Text>
				</Box>
			)}
		</Box>
	)
}
