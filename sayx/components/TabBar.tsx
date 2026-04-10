import { Box, Text } from 'ink'
import React from 'react'

import type { Tab } from '../lib/types.ts'

const TABS: { id: Tab; label: string }[] = [
	{ id: 'voices', label: 'Voices' },
	{ id: 'favorites', label: 'Favorites' },
	{ id: 'settings', label: 'Settings' },
]

export function TabBar({ activeTab, dirty }: { activeTab: Tab; dirty: boolean }) {
	return (
		<Box marginBottom={0}>
			{TABS.map((tab, i) => (
				<React.Fragment key={tab.id}>
					{i > 0 && <Text dimColor> </Text>}
					{tab.id === activeTab ? (
						<Text bold color='cyan'>
							{'[ '}
							{tab.label}
							{' ]'}
						</Text>
					) : (
						<Text dimColor>
							{'  '}
							{tab.label}
							{'  '}
						</Text>
					)}
				</React.Fragment>
			))}
			<Text dimColor>{'  ←/→ tabs'}</Text>
			{dirty && (
				<Text color='yellow' bold>
					{'  ● unsaved'}
				</Text>
			)}
		</Box>
	)
}
