import { Box, Text } from 'ink'
import React from 'react'

import type { KeybindingMap, TextSource } from '../lib/types.ts'

type TextSourceSelectorProps = {
	activeSource: TextSource
	bindings: KeybindingMap
}

const SOURCES: { key: keyof KeybindingMap; label: string; source: TextSource }[] = [
	{ source: 'deterministic', key: 'modeDeterministic', label: 'Deterministic' },
	{ source: 'wikipedia', key: 'modeWikipedia', label: 'Wikipedia' },
	{ source: 'quote', key: 'modeQuote', label: 'Random Quote' },
	{ source: 'custom', key: 'modeCustom', label: 'Custom' },
]

export function TextSourceSelector({ activeSource, bindings }: TextSourceSelectorProps) {
	return (
		<Box flexDirection='column'>
			<Text bold>{'Text Source'}</Text>
			{SOURCES.map(({ source, key, label }) => {
				const isActive = source === activeSource
				return (
					<Box key={source} gap={1}>
						<Text color={isActive ? 'yellow' : undefined} dimColor={!isActive} bold={isActive}>
							{bindings[key]}
						</Text>
						<Text color={isActive ? 'green' : undefined} dimColor={!isActive} bold={isActive}>
							{label}
						</Text>
					</Box>
				)
			})}
		</Box>
	)
}
