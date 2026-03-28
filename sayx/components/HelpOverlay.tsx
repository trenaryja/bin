import { Box, Text } from 'ink'
import React from 'react'

import type { KeybindingMap } from '../lib/types.ts'
import { getBindingLabel } from '../lib/keybindings.ts'

import { Modal } from './Modal.tsx'

type HelpOverlayProps = {
	bindings: KeybindingMap
}

const SECTIONS: { title: string; actions: { action: string; label: string }[] }[] = [
	{
		title: 'Navigation',
		actions: [
			{ action: 'prevVoice', label: 'Previous voice' },
			{ action: 'nextVoice', label: 'Next voice' },
			{ action: 'tabPrev', label: 'Previous tab' },
			{ action: 'tabNext', label: 'Next tab' },
		],
	},
	{
		title: 'Playback',
		actions: [
			{ action: 'play', label: 'Play selected voice' },
			{ action: 'stop', label: 'Stop playback' },
			{ action: 'rateUp', label: 'Increase rate (+25 wpm)' },
			{ action: 'rateDown', label: 'Decrease rate (-25 wpm)' },
			{ action: 'rateUpBig', label: 'Increase rate (+100 wpm)' },
			{ action: 'rateDownBig', label: 'Decrease rate (-100 wpm)' },
		],
	},
	{
		title: 'Text Source',
		actions: [
			{ action: 'modeDeterministic', label: 'Deterministic phrase' },
			{ action: 'modeWikipedia', label: 'Wikipedia random' },
			{ action: 'modeQuote', label: 'Random quote' },
			{ action: 'modeCustom', label: 'Custom text input' },
		],
	},
	{
		title: 'Filters & Search',
		actions: [
			{ action: 'search', label: 'Search voices' },
			{ action: 'tagFilter', label: 'Filter by tags' },
			{ action: 'languageFilter', label: 'Filter by language' },
		],
	},
	{
		title: 'Other',
		actions: [
			{ action: 'toggleFavorite', label: 'Toggle favorite' },
			{ action: 'save', label: 'Save config to disk' },
			{ action: 'quit', label: 'Quit' },
		],
	},
]

export function HelpOverlay({ bindings }: HelpOverlayProps) {
	return (
		<Modal title='Keybindings'>
			{SECTIONS.map((section) => (
				<Box key={section.title} flexDirection='column' marginBottom={1}>
					<Text bold underline>
						{section.title}
					</Text>
					{section.actions.map(({ action, label }) => {
						const binding = bindings[action as keyof KeybindingMap]
						return (
							<Box key={action}>
								<Box width={14}>
									<Text color='yellow' bold>
										{getBindingLabel(binding)}
									</Text>
								</Box>
								<Text>{label}</Text>
							</Box>
						)
					})}
				</Box>
			))}
			<Text dimColor>Press any key to close</Text>
		</Modal>
	)
}
