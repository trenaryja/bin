import { Box, Text } from 'ink'
import React from 'react'

import { useTagInput } from '../hooks/use-tag-input.ts'

type TagBoxProps = {
	activeTags: string[]
	allTags: string[]
	focused: boolean
	label?: string
	onRequestFocusDown: () => void
	onRequestFocusUp: () => void
	onTagsChange: (tags: string[]) => void
}

export function TagBox({
	allTags,
	activeTags,
	focused,
	label,
	onTagsChange,
	onRequestFocusUp,
	onRequestFocusDown,
}: TagBoxProps) {
	const { chipCursor, chipFocused, editing, inputValue, otherMatches, typeaheadMatch } = useTagInput({
		activeTags,
		allTags,
		focused,
		onRequestFocusDown,
		onRequestFocusUp,
		onTagsChange,
	})

	return (
		<Box
			flexDirection='column'
			borderStyle='round'
			borderColor={focused ? 'blue' : 'gray'}
			paddingX={1}
			marginBottom={1}
		>
			<Box gap={1} flexWrap='wrap'>
				{label && <Text dimColor>{label}:</Text>}
				{activeTags.map((tag, i) => {
					const isHighlighted = focused && chipFocused && chipCursor === i
					return (
						<Text key={tag} color={isHighlighted ? 'red' : 'blue'} bold={isHighlighted} inverse={isHighlighted}>
							{' '}
							{tag}
							{isHighlighted ? ' ×' : ''}{' '}
						</Text>
					)
				})}

				<Box>
					{editing ? (
						<>
							<Text color='cyan'>{inputValue}│</Text>
							{typeaheadMatch && <Text dimColor>{typeaheadMatch.slice(inputValue.length)}</Text>}
						</>
					) : inputValue ? (
						<Text dimColor>{inputValue}</Text>
					) : activeTags.length === 0 ? (
						<Text dimColor>{focused ? 'type to add tags' : 'no tag filters'}</Text>
					) : null}
				</Box>

				{editing && typeaheadMatch && <Text dimColor>Tab accept</Text>}
			</Box>

			{editing && otherMatches.length > 0 && (
				<Box gap={1}>
					{otherMatches.map((tag) => (
						<Text key={tag} dimColor>
							{tag}
						</Text>
					))}
				</Box>
			)}
		</Box>
	)
}
