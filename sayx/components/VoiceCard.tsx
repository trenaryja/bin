import { Box, Text } from 'ink'
import React from 'react'

import type { Voice } from '../lib/types.ts'

type VoiceCardProps = {
	isCurrentlyPlaying: boolean
	isFavorite: boolean
	isSelected: boolean
	voice: Voice
}

export function VoiceCard({ voice, isSelected, isFavorite, isCurrentlyPlaying }: VoiceCardProps) {
	return (
		<Box>
			<Text color={isSelected ? 'green' : undefined} bold={isSelected}>
				{isSelected ? '▸ ' : '  '}
				{isCurrentlyPlaying ? '♪ ' : '  '}
				{isFavorite ? '★ ' : '  '}
				{voice.name}
			</Text>
			<Text dimColor> {voice.locale}</Text>
		</Box>
	)
}
