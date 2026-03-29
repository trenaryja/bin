import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import React from 'react'

type SearchOverlayProps = {
	onChange: (value: string) => void
	resultCount: number
	totalCount: number
	value: string
}

export function SearchOverlay({ value, onChange, resultCount, totalCount }: SearchOverlayProps) {
	const hasQuery = value.length > 0

	return (
		<Box
			flexDirection='column'
			borderStyle='round'
			borderColor='cyan'
			paddingX={2}
			paddingY={1}
			width={60}
		>
			<Box marginBottom={1}>
				<Text bold color='cyan'>{'Search Voices'}</Text>
			</Box>

			<Box>
				<Text color='yellow' bold>{'/ '}</Text>
				<TextInput value={value} onChange={onChange} />
			</Box>

			<Box marginTop={1} gap={2}>
				{hasQuery ? (
					<Text>
						<Text color={resultCount > 0 ? 'green' : 'red'} bold>
							{resultCount}
						</Text>
						<Text dimColor>{'/'}{totalCount}{' voices match'}</Text>
					</Text>
				) : (
					<Text dimColor>{'Type to filter voices by name, bio, or tag'}</Text>
				)}
			</Box>

			<Box marginTop={1} gap={2}>
				<Text dimColor>
					<Text color='yellow'>{'Enter'}</Text>{' apply'}
				</Text>
				<Text dimColor>
					<Text color='yellow'>{'Esc'}</Text>{' close'}
				</Text>
			</Box>
		</Box>
	)
}
