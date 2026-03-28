import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import React from 'react'

import { Modal } from './Modal.tsx'

type LanguageFilterProps = {
	languages: string[]
	onChange: (value: string) => void
	onSubmit: (value: string) => void
	value: string
}

export function LanguageFilter({ value, onChange, onSubmit, languages }: LanguageFilterProps) {
	return (
		<Modal title='Language Filter'>
			<Text>{'Enter a language code (e.g. en, fr, de, ja) or leave empty for all:'}</Text>
			<Text> </Text>
			<Box>
				<Text color='yellow'>{'Filter: '}</Text>
				<TextInput value={value} onChange={onChange} onSubmit={onSubmit} />
			</Box>
			<Text> </Text>
			<Text dimColor>{'Available: '}{languages.join(', ')}</Text>
			<Text> </Text>
			<Text dimColor>{'Enter to apply · Esc to cancel'}</Text>
		</Modal>
	)
}
