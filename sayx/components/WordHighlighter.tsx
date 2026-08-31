import { Text } from 'ink'
import React, { useEffect, useRef, useState } from 'react'

type WordHighlighterProps = {
	active: boolean
	delay: number
	rate: number
	text: string
}

// Mounted with `key={playCount}` so each playback gets a fresh highlight cursor —
// that keeps the reset out of the effect body, where it would cascade renders.
export function WordHighlighter({ text, rate, active, delay }: WordHighlighterProps) {
	const words = text.split(/\s+/)
	const [wordIndex, setWordIndex] = useState(-1)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (!active || !text.trim()) return

		const msPerWord = 60000 / rate

		// Delay before starting highlight to account for speech synthesis + audio latency
		timerRef.current = setTimeout(() => {
			setWordIndex(0)

			timerRef.current = setInterval(() => {
				setWordIndex((i) => {
					if (i >= words.length - 1) {
						if (timerRef.current) clearInterval(timerRef.current)
						return i
					}

					return i + 1
				})
			}, msPerWord)
		}, delay)

		return () => {
			if (!timerRef.current) return
			clearTimeout(timerRef.current)
			clearInterval(timerRef.current)
			timerRef.current = null
		}
	}, [active, text, words.length, rate, delay])

	if (!active || wordIndex < 0)
		return (
			<Text wrap='wrap' dimColor>
				{text.slice(0, 120)}
				{text.length > 120 ? '…' : ''}
			</Text>
		)

	return (
		<Text wrap='wrap'>
			{words.map((word, i) => (
				// eslint-disable-next-line @eslint-react/no-array-index-key -- word position is the identity: the same index drives the highlight cursor, and the component remounts per playback
				<Text key={i}>
					{i > 0 ? ' ' : ''}
					<Text color={i === wordIndex ? 'green' : undefined} bold={i === wordIndex} dimColor={i > wordIndex}>
						{word}
					</Text>
				</Text>
			))}
		</Text>
	)
}
