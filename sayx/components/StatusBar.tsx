import { Box, Text } from 'ink'
import React from 'react'

import type { KeybindingMap } from '../lib/types.ts'
import { getBindingLabel } from '../lib/keybindings.ts'

type StatusBarProps = {
	bindings: KeybindingMap
	dirty: boolean
}

export function StatusBar({ bindings, dirty }: StatusBarProps) {
	const hints: [string, string][] = [
		[getBindingLabel(bindings.prevVoice) + '/' + getBindingLabel(bindings.nextVoice), 'navigate'],
		[getBindingLabel(bindings.play), 'play'],
		[getBindingLabel(bindings.stop), 'stop'],
		[getBindingLabel(bindings.rateDown) + '/' + getBindingLabel(bindings.rateUp), 'rate'],
		[getBindingLabel(bindings.toggleFavorite), 'fav'],
		[getBindingLabel(bindings.tagFilter), 'tags'],
		[getBindingLabel(bindings.search), 'search'],
		[getBindingLabel(bindings.help), 'help'],
	]

	if (dirty) {
		hints.push([getBindingLabel(bindings.save), 'save'])
	}

	return (
		<Box marginBottom={1} gap={1}>
			{hints.map(([keys, label]) => (
				<Box key={label}>
					<Text color='yellow' bold>
						{keys}
					</Text>
					<Text dimColor={label !== 'save'} color={label === 'save' ? 'yellow' : undefined}>
						{' '}
						{label}
					</Text>
				</Box>
			))}
		</Box>
	)
}
