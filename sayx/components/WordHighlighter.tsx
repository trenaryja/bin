import { Text } from 'ink'
import React, { useEffect, useRef, useState } from 'react'

type WordHighlighterProps = {
	active: boolean
	rate: number
	text: string
}

export function WordHighlighter({ text, rate, active }: WordHighlighterProps) {
	const words = text.split(/\s+/)
	const [wordIndex, setWordIndex] = useState(-1)
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

	useEffect(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current)
			intervalRef.current = null
		}

		if (!active || words.length === 0) {
			setWordIndex(-1)
			return
		}

		const msPerWord = 60000 / rate
		setWordIndex(0)

		intervalRef.current = setInterval(() => {
			setWordIndex((i) => {
				if (i >= words.length - 1) {
					if (intervalRef.current) clearInterval(intervalRef.current)
					return i
				}
				return i + 1
			})
		}, msPerWord)

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current)
		}
	}, [active, text, rate])

	if (!active || wordIndex < 0) {
		// Show truncated preview when not playing
		const preview = text.slice(0, 120)
		return (
			<Text wrap='wrap' dimColor>
				{preview}
				{text.length > 120 ? '…' : ''}
			</Text>
		)
	}

	// Render words with current word highlighted
	return (
		<Text wrap='wrap'>
			{words.map((word, i) => {
				const isCurrentWord = i === wordIndex
				const isPast = i < wordIndex
				const isFuture = i > wordIndex

				return (
					<Text key={i}>
						{i > 0 ? ' ' : ''}
						<Text
							color={isCurrentWord ? 'green' : undefined}
							bold={isCurrentWord}
							dimColor={isFuture}
						>
							{word}
						</Text>
					</Text>
				)
			})}
		</Text>
	)
}
