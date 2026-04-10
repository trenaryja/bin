import { Box, Text, useInput } from 'ink'
import React, { useState } from 'react'

type TagBoxProps = {
	activeTags: string[]
	allTags: string[]
	focused: boolean
	label?: string
	onRequestFocusDown: () => void
	onRequestFocusUp: () => void
	onTagsChange: (tags: string[]) => void
}

const isBackspace = (input: string, key: { backspace: boolean; delete: boolean }) =>
	key.backspace || key.delete || input === '\x7f' || input === '\b'

const isPrintable = (input: string, key: { ctrl: boolean; meta: boolean }) =>
	input.length === 1 && input.charCodeAt(0) >= 32 && input.charCodeAt(0) <= 126 && !key.ctrl && !key.meta

export function TagBox({
	allTags,
	activeTags,
	focused,
	label,
	onTagsChange,
	onRequestFocusUp,
	onRequestFocusDown,
}: TagBoxProps) {
	const [inputValue, setInputValue] = useState('')
	const [chipFocused, setChipFocused] = useState(false)
	const [chipCursor, setChipCursor] = useState(0)

	const typeaheadMatch = inputValue
		? allTags.find((tag) => !activeTags.includes(tag) && tag.toLowerCase().startsWith(inputValue.toLowerCase()))
		: undefined

	const otherMatches = inputValue
		? allTags
				.filter(
					(tag) =>
						!activeTags.includes(tag) && tag.toLowerCase().includes(inputValue.toLowerCase()) && tag !== typeaheadMatch,
				)
				.slice(0, 5)
		: []

	function addTag(tag: string) {
		if (!activeTags.includes(tag)) onTagsChange([...activeTags, tag])
		setInputValue('')
	}

	function removeTagAt(index: number) {
		const next = activeTags.filter((_, i) => i !== index)
		onTagsChange(next)
		setChipFocused(next.length > 0)
		setChipCursor(next.length === 0 ? 0 : Math.min(index, next.length - 1))
	}

	useInput((input, key) => {
		if (!focused) return

		// ── Chip navigation ──
		if (chipFocused && activeTags.length > 0) {
			if (key.leftArrow) {
				setChipCursor((c) => Math.max(0, c - 1))
				return
			}
			if (key.rightArrow) {
				if (chipCursor >= activeTags.length - 1) setChipFocused(false)
				else setChipCursor((c) => c + 1)
				return
			}
			if (key.return || isBackspace(input, key)) {
				removeTagAt(chipCursor)
				return
			}
			if (key.upArrow) {
				onRequestFocusUp()
				return
			}
			if (key.downArrow) {
				onRequestFocusDown()
				return
			}
			if (isPrintable(input, key)) {
				setChipFocused(false)
				setInputValue(input)
				return
			}
			return
		}

		// ── Input zone ──
		if (key.upArrow) {
			onRequestFocusUp()
			return
		}
		if (key.downArrow) {
			onRequestFocusDown()
			return
		}
		if (key.leftArrow && inputValue === '' && activeTags.length > 0) {
			setChipFocused(true)
			setChipCursor(activeTags.length - 1)
			return
		}
		if (key.tab || key.return) {
			if (typeaheadMatch) addTag(typeaheadMatch)
			return
		}
		if (isBackspace(input, key)) {
			if (inputValue.length > 0) setInputValue((v) => v.slice(0, -1))
			else if (activeTags.length > 0) removeTagAt(activeTags.length - 1)
			return
		}
		if (isPrintable(input, key)) {
			setInputValue((v) => v + input)
			return
		}
	})

	const hasTypeahead = !!typeaheadMatch

	return (
		<Box
			flexDirection='column'
			borderStyle='round'
			borderColor={focused ? 'blue' : 'gray'}
			paddingX={1}
			marginBottom={1}
		>
			<Box gap={1} flexWrap='wrap'>
				{label && (
					<Text dimColor>
						{label}
						{':'}
					</Text>
				)}
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
					{focused && !chipFocused ? (
						<>
							<Text color='cyan'>
								{inputValue}
								{'│'}
							</Text>
							{typeaheadMatch && <Text dimColor>{typeaheadMatch.slice(inputValue.length)}</Text>}
						</>
					) : inputValue ? (
						<Text dimColor>{inputValue}</Text>
					) : activeTags.length === 0 ? (
						<Text dimColor>{focused ? 'type to add tags' : 'no tag filters'}</Text>
					) : null}
				</Box>

				{focused && !chipFocused && hasTypeahead && <Text dimColor>{'Tab accept'}</Text>}
			</Box>

			{focused && !chipFocused && otherMatches.length > 0 && (
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
