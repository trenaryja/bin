import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import React from 'react'

import { Modal } from './Modal.tsx'

type CustomTextInputProps = {
	onChange: (value: string) => void
	onSubmit: (value: string) => void
	value: string
}

export function CustomTextInput({ value, onChange, onSubmit }: CustomTextInputProps) {
	return (
		<Modal title='Custom Text'>
			<Text>{'Type the text you want to hear spoken:'}</Text>
			<Text> </Text>
			<Box>
				<Text color='yellow'>{'Text: '}</Text>
				<TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
			</Box>
			<Text> </Text>
			<Text dimColor>{'Enter to save · Esc to cancel'}</Text>
		</Modal>
	)
}
