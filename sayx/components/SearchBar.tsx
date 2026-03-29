import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import React from 'react'

type SearchBarProps = {
	focused: boolean
	onChange: (value: string) => void
	onRequestFocusDown: () => void
	resultCount: number
	value: string
}

export function SearchBar({ value, onChange, focused, resultCount, onRequestFocusDown }: SearchBarProps) {
	useInput((_input, key) => {
		if (!focused) return
		if (key.downArrow || key.return) {
			onRequestFocusDown()
		}
	})

	const hasQuery = value.length > 0

	return (
		<Box
			borderStyle='round'
			borderColor={focused ? 'cyan' : 'gray'}
			paddingX={1}
			marginBottom={0}
		>
			<Text color={focused ? 'cyan' : 'gray'} bold>{'/ '}</Text>
			<TextInput
				value={value}
				onChange={onChange}
				focus={focused}
			/>
			{hasQuery && (
				<Text dimColor>{' — '}{resultCount}{' match'}</Text>
			)}
			{!hasQuery && focused && (
				<Text dimColor>{'type to filter'}</Text>
			)}
		</Box>
	)
}
