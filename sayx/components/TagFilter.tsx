import { Box, Text, useInput } from 'ink'
import React, { useState } from 'react'

import { Modal } from './Modal.tsx'

type TagFilterProps = {
	activeTags: string[]
	allTags: string[]
	onApply: (tags: string[]) => void
}

export function TagFilter({ allTags, activeTags, onApply }: TagFilterProps) {
	const [cursor, setCursor] = useState(0)
	const [selected, setSelected] = useState<Set<string>>(new Set(activeTags))

	useInput((input, key) => {
		if (key.upArrow) setCursor((c) => Math.max(0, c - 1))
		if (key.downArrow) setCursor((c) => Math.min(allTags.length, c + 1))

		if (input === ' ' || key.return) {
			if (cursor === allTags.length) {
				onApply([])
				return
			}

			const tag = allTags[cursor]!
			setSelected((prev) => {
				const next = new Set(prev)
				if (next.has(tag)) next.delete(tag)
				else next.add(tag)
				return next
			})
		}

		if (input === 'a') {
			onApply([...selected])
		}
	})

	const VISIBLE = 15
	const offset = Math.max(0, cursor - VISIBLE + 2)
	const visibleTags = allTags.slice(offset, offset + VISIBLE)

	return (
		<Modal title='Filter by Tags'>
			<Text dimColor>{'Space to toggle · a to apply · Esc to cancel'}</Text>
			<Text> </Text>

			{visibleTags.map((tag, i) => {
				const idx = offset + i
				const isActive = selected.has(tag)
				const isCursor = idx === cursor
				return (
					<Box key={tag}>
						<Text color={isCursor ? 'green' : undefined} bold={isCursor}>
							{isCursor ? '▸ ' : '  '}
							{isActive ? '[✓] ' : '[ ] '}
							{tag}
						</Text>
					</Box>
				)
			})}

			<Text> </Text>
			<Text color={cursor === allTags.length ? 'green' : undefined} bold={cursor === allTags.length}>
				{cursor === allTags.length ? '▸ ' : '  '}
				{'Clear all filters'}
			</Text>
		</Modal>
	)
}
