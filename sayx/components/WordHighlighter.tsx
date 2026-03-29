import { Text } from 'ink'
import React, { useEffect, useRef, useState } from 'react'

type WordHighlighterProps = {
	active: boolean
	delay: number
	playKey: string
	rate: number
	text: string
}

export function WordHighlighter({ text, rate, active, playKey, delay }: WordHighlighterProps) {
	const words = text.split(/\s+/)
	const [wordIndex, setWordIndex] = useState(-1)
	const timerRef = useRef<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null>(null)

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current as ReturnType<typeof setTimeout>)
		if (timerRef.current) clearInterval(timerRef.current as ReturnType<typeof setInterval>)
		timerRef.current = null

		if (!active || words.length === 0) {
			setWordIndex(-1)
			return
		}

		const msPerWord = 60000 / rate

		// Delay before starting highlight to account for speech synthesis + audio latency
		timerRef.current = setTimeout(() => {
			setWordIndex(0)

			timerRef.current = setInterval(() => {
				setWordIndex((i) => {
					if (i >= words.length - 1) {
						if (timerRef.current) clearInterval(timerRef.current as ReturnType<typeof setInterval>)
						return i
					}
					return i + 1
				})
			}, msPerWord)
		}, delay)

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current as ReturnType<typeof setTimeout>)
				clearInterval(timerRef.current as ReturnType<typeof setInterval>)
			}
		}
	}, [active, text, rate, playKey, delay])

	if (!active || wordIndex < 0)
		return (
			<Text wrap='wrap' dimColor>
				{text.slice(0, 120)}{text.length > 120 ? '…' : ''}
			</Text>
		)

	return (
		<Text wrap='wrap'>
			{words.map((word, i) => (
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
