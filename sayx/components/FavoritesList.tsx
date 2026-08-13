import { Box, Text, useInput } from 'ink'
import React from 'react'

import type { Favorite, SayxConfig } from '../lib/types.ts'
import { getVoiceMeta } from '../lib/voices.ts'

type FavoritesListProps = {
	config: SayxConfig
	cursor: number
	favorites: Favorite[]
	onRemove: (index: number) => void
}

export function FavoritesList({ favorites, config, cursor, onRemove }: FavoritesListProps) {
	useInput((input, key) => {
		if ((input === 'x' || key.delete) && favorites.length > 0) {
			onRemove(cursor)
		}
	})

	if (favorites.length === 0) {
		return (
			<Box flexDirection='column' paddingX={2} paddingY={1}>
				<Text dimColor>No favorites yet.</Text>
				<Text dimColor>Navigate to the Voices tab and press f on a voice to save it.</Text>
			</Box>
		)
	}

	const selectedFav = favorites[cursor]
	const selectedMeta = selectedFav ? getVoiceMeta(selectedFav.voice, config) : undefined

	return (
		<Box paddingX={2} paddingY={1}>
			<Box flexDirection='column' width={44}>
				{favorites.map((fav, i) => (
					<Box key={`${fav.voice}-${fav.rate}-${i}`}>
						<Text color={i === cursor ? 'green' : undefined} bold={i === cursor}>
							{i === cursor ? '▸ ' : '  '}
							{'★ '}
							{fav.voice}
						</Text>
						<Text dimColor>
							{' @ '}
							{fav.rate}
							{' wpm'}
						</Text>
					</Box>
				))}

				<Text> </Text>
				<Text dimColor>Enter to play · x to remove · ← back to Voices</Text>
			</Box>

			{selectedFav && (
				<Box flexDirection='column' marginLeft={3} width={36}>
					<Text bold>Selected</Text>
					<Text>{selectedFav.voice}</Text>
					<Text dimColor>
						{'@ '}
						{selectedFav.rate}
						{' wpm'}
					</Text>

					{selectedMeta?.bio && (
						<Box marginTop={1} flexDirection='column'>
							<Text dimColor italic wrap='wrap'>
								{selectedMeta.bio}
							</Text>
						</Box>
					)}

					{selectedMeta?.tags.length && (
						<Box flexWrap='wrap' gap={1} marginTop={1}>
							{selectedMeta.tags.map((tag) => (
								<Text key={tag} color='blue'>
									[{tag}]
								</Text>
							))}
						</Box>
					)}
				</Box>
			)}
		</Box>
	)
}
