import { Box, Text, useInput } from 'ink'
import React, { useState } from 'react'

import type { Favorite, SayxConfig } from '../lib/types.ts'
import { getVoiceMeta } from '../lib/voices.ts'

type FavoritesListProps = {
	config: SayxConfig
	cursor: number
	favorites: Favorite[]
	onCursorChange: (cursor: number) => void
	onRemove: (index: number) => void
}

export function FavoritesList({ favorites, config, cursor, onCursorChange, onRemove }: FavoritesListProps) {
	useInput((input, key) => {
		if ((input === 'x' || key.delete) && favorites.length > 0) {
			onRemove(cursor)
			if (cursor >= favorites.length - 1) onCursorChange(Math.max(0, favorites.length - 2))
		}
	})

	if (favorites.length === 0) {
		return (
			<Box flexDirection='column' paddingX={2} paddingY={1}>
				<Text dimColor>{'No favorites yet.'}</Text>
				<Text dimColor>{'Navigate to the Voices tab and press f on a voice to save it.'}</Text>
			</Box>
		)
	}

	const selectedFav = favorites[cursor]
	const selectedMeta = selectedFav ? getVoiceMeta(selectedFav.voice, config) : undefined

	return (
		<Box flexDirection='column' width={44}>
			{favorites.map((fav, i) => (
				<Box key={`${fav.voice}-${fav.rate}-${i}`}>
					<Text color={i === cursor ? 'green' : undefined} bold={i === cursor}>
						{i === cursor ? '▸ ' : '  '}
						{'★ '}
						{fav.voice}
					</Text>
					<Text dimColor>{' @ '}{fav.rate}{' wpm'}</Text>
				</Box>
			))}

			<Text> </Text>
			<Text dimColor>{'Enter to play · x to remove · ← back to Voices'}</Text>
		</Box>
	)
}
