import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import React from 'react'

import { Modal } from './Modal.tsx'

type SearchOverlayProps = {
	onChange: (value: string) => void
	onSubmit: () => void
	value: string
}

export function SearchOverlay({ value, onChange, onSubmit }: SearchOverlayProps) {
	return (
		<Modal title='Search Voices'>
			<Text>Search by name, bio, or tag:</Text>
			<Text> </Text>
			<Box>
				<Text color='yellow'>{'/ '}</Text>
				<TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
			</Box>
			<Text> </Text>
			<Text dimColor>{'Enter to apply · Esc to cancel'}</Text>
		</Modal>
	)
}
