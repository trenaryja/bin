import { Box, Text } from 'ink'
import React from 'react'

import type { SayxConfig } from '../lib/types.ts'
import { getBindingLabel } from '../lib/keybindings.ts'

type SettingsViewProps = {
	config: SayxConfig
	configPath: string
}

export function SettingsView({ config, configPath }: SettingsViewProps) {
	const entries = Object.entries(config.keybindings)
	const mid = Math.ceil(entries.length / 2)
	const col1 = entries.slice(0, mid)
	const col2 = entries.slice(mid)

	return (
		<Box flexDirection='column' paddingX={2} paddingY={1}>
			<Box flexDirection='column' marginBottom={1}>
				<Text bold underline>
					{'Config File'}
				</Text>
				<Text>{configPath}</Text>
			</Box>

			<Box flexDirection='column' marginBottom={1}>
				<Text bold underline>
					{'Defaults'}
				</Text>
				<Box gap={4}>
					<Text>
						{'Language: '}
						<Text color='yellow'>{config.defaultLanguage}</Text>
					</Text>
					<Text>
						{'Rate: '}
						<Text color='yellow'>{config.defaultRate}</Text>
						{' wpm'}
					</Text>
					<Text>
						{'Range: '}
						{config.rateMin}
						{'–'}
						{config.rateMax}
					</Text>
					<Text>
						{'Step: '}
						<Text color='yellow'>{config.rateStep}</Text>
						{' / '}
						<Text color='yellow'>{config.rateBigStep}</Text>
					</Text>
					<Text>
						{'Vis: '}
						<Text color='yellow'>{config.defaultVisualization}</Text>
					</Text>
				</Box>
			</Box>

			<Box flexDirection='column' marginBottom={1}>
				<Text bold underline>
					{'Deterministic Phrases'}
				</Text>
				<Text dimColor>
					{config.deterministicPhrases.length}
					{' phrases configured (press d to cycle)'}
				</Text>
			</Box>

			<Box flexDirection='column' marginBottom={1}>
				<Text bold underline>
					{'Voice Metadata'}
				</Text>
				<Text dimColor>
					{Object.keys(config.voices).length}
					{' voices with bios and tags'}
				</Text>
			</Box>

			<Box flexDirection='column' marginBottom={1}>
				<Text bold underline>
					{'Keybindings'}
				</Text>
				<Box gap={4}>
					<Box flexDirection='column'>
						{col1.map(([action, key]) => (
							<Box key={action} gap={1}>
								<Box width={20}>
									<Text dimColor>{action}</Text>
								</Box>
								<Text color='yellow'>{getBindingLabel(key)}</Text>
							</Box>
						))}
					</Box>
					<Box flexDirection='column'>
						{col2.map(([action, key]) => (
							<Box key={action} gap={1}>
								<Box width={20}>
									<Text dimColor>{action}</Text>
								</Box>
								<Text color='yellow'>{getBindingLabel(key)}</Text>
							</Box>
						))}
					</Box>
				</Box>
			</Box>

			<Text dimColor>
				{'Edit '}
				{configPath}
				{' to customize'}
			</Text>
		</Box>
	)
}
