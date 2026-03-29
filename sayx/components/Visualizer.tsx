import { Text } from 'ink'
import React, { useEffect, useState } from 'react'

const BARS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588']
const WIDTH = 24
const COLORS = ['green', 'green', 'green', 'yellow', 'yellow', 'red', 'red', 'red'] as const

export function Visualizer({ active }: { active: boolean }) {
	const [frame, setFrame] = useState(0)

	useEffect(() => {
		if (!active) return

		const interval = setInterval(() => {
			setFrame((f) => f + 1)
		}, 80)

		return () => clearInterval(interval)
	}, [active])

	if (!active) return <Text dimColor>{BARS[0]!.repeat(WIDTH)}</Text>

	const levels = Array.from({ length: WIDTH }, (_, i) => {
		const wave1 = Math.sin((frame * 0.3 + i * 0.5) * 1.0) * 0.5
		const wave2 = Math.sin((frame * 0.2 + i * 0.8) * 0.7) * 0.3
		const wave3 = Math.sin((frame * 0.5 + i * 0.3) * 1.3) * 0.2
		const combined = (wave1 + wave2 + wave3 + 1) / 2
		return Math.min(BARS.length - 1, Math.max(0, Math.floor(combined * BARS.length)))
	})

	return (
		<Text>
			{levels.map((level, i) => (
				<Text key={i} color={COLORS[level]}>
					{BARS[level]}
				</Text>
			))}
		</Text>
	)
}
