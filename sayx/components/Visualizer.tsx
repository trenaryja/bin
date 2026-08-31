import { Text } from 'ink'
import React, { useEffect, useState } from 'react'

import type { VisualizationMode } from '../lib/types.ts'

const BARS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588']
const WIDTH = 24
const COLORS = ['green', 'green', 'green', 'yellow', 'yellow', 'red', 'red', 'red'] as const

// ── Perlin noise (1D, simplified) ─────────────────────────────────────────────

function fade(t: number) {
	return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number) {
	return a + t * (b - a)
}

// prettier-ignore
const PERM_TABLE = [
	151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
	140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
	247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
	57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
	74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
	60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
	65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
	200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
	52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
	207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
	119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
	129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
	218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
	81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
	184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
	222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
]

const PERM = Array.from({ length: 512 }, (_, i) => PERM_TABLE[i % 256]!)

function perlin1d(x: number): number {
	const xi = Math.floor(x) & 255
	const xf = x - Math.floor(x)
	const u = fade(xf)
	const g1 = PERM[xi]! % 2 === 0 ? xf : -xf
	const g2 = PERM[xi + 1]! % 2 === 0 ? xf - 1 : -(xf - 1)

	return lerp(g1, g2, u)
}

// ── Visualization renderers ───────────────────────────────────────────────────

type Cell = { char: string; color: string }

function toBarLevel(combined: number): number {
	return Math.min(BARS.length - 1, Math.max(0, Math.floor(combined * BARS.length)))
}

function barCell(level: number, color?: string): Cell {
	return { char: BARS[level]!, color: color ?? COLORS[level]! }
}

function renderWaves(frame: number): Cell[] {
	return Array.from({ length: WIDTH }, (_, i) => {
		const wave1 = Math.sin((frame * 0.3 + i * 0.5) * 1.0) * 0.5
		const wave2 = Math.sin((frame * 0.2 + i * 0.8) * 0.7) * 0.3
		const wave3 = Math.sin((frame * 0.5 + i * 0.3) * 1.3) * 0.2

		return barCell(toBarLevel((wave1 + wave2 + wave3 + 1) / 2))
	})
}

function renderPerlin(frame: number): Cell[] {
	const t = frame * 0.06

	return Array.from({ length: WIDTH }, (_, i) => {
		const n1 = perlin1d(i * 0.15 + t)
		const n2 = perlin1d(i * 0.3 + t * 1.4 + 100) * 0.5
		const n3 = perlin1d(i * 0.6 + t * 0.7 + 200) * 0.25

		return barCell(toBarLevel((n1 + n2 + n3 + 1) / 2))
	})
}

// ── Spectrum colors (rainbow gradient) ────────────────────────────────────────

const SPECTRUM_COLORS = [
	'red',
	'redBright',
	'yellow',
	'yellowBright',
	'green',
	'greenBright',
	'cyan',
	'cyanBright',
	'blue',
	'blueBright',
	'magenta',
	'magentaBright',
] as const

function spectrumColor(i: number, width: number): string {
	const idx = Math.floor((i / width) * SPECTRUM_COLORS.length)

	return SPECTRUM_COLORS[Math.min(idx, SPECTRUM_COLORS.length - 1)]!
}

function renderSpectrum(frame: number): Cell[] {
	return Array.from({ length: WIDTH }, (_, i) => {
		const centerDist = Math.abs(i - WIDTH / 2) / (WIDTH / 2)
		const bass = Math.sin(frame * 0.15) * (1 - centerDist) * 0.6
		const mid = Math.sin(frame * 0.4 + i * 0.9) * Math.exp(-centerDist * 1.5) * 0.5
		const treble = Math.sin(frame * 0.8 + i * 2.0) * centerDist * 0.3

		return barCell(toBarLevel((bass + mid + treble + 1) / 2), spectrumColor(i, WIDTH))
	})
}

function renderPulse(frame: number): Cell[] {
	const beat = Math.sin(frame * 0.2) ** 2
	const subBeat = Math.sin(frame * 0.8) ** 4 * 0.3

	return Array.from({ length: WIDTH }, (_, i) => {
		const center = WIDTH / 2
		const dist = Math.abs(i - center) / center
		const ripple = Math.sin((dist * 6 - frame * 0.5) * Math.PI) * 0.5 + 0.5
		const intensity = ripple * (beat + subBeat) * (1 - dist * 0.4)

		return barCell(toBarLevel(intensity))
	})
}

const RAIN_CHARS = [' ', '\u00B7', ':', '\u2502', '\u2503', '\u254F', '\u2507', '\u2588']

function renderRain(frame: number): Cell[] {
	return Array.from({ length: WIDTH }, (_, i) => {
		const speed = 0.5 + ((i * 7 + 3) % 11) / 5.5
		const phase = (frame * speed * 0.08 + i * 137.5) % 12
		const intensity = phase < 3 ? phase / 3 : phase < 5 ? 1 : Math.max(0, 1 - (phase - 5) / 4)
		const level = Math.min(RAIN_CHARS.length - 1, Math.max(0, Math.floor(intensity * RAIN_CHARS.length)))
		const color = level < 2 ? 'cyan' : level < 5 ? 'blue' : 'magenta'

		return { char: RAIN_CHARS[level]!, color }
	})
}

function renderFrame(mode: VisualizationMode, frame: number): Cell[] {
	switch (mode) {
		case 'waves':
			return renderWaves(frame)
		case 'perlin':
			return renderPerlin(frame)
		case 'spectrum':
			return renderSpectrum(frame)
		case 'pulse':
			return renderPulse(frame)
		case 'rain':
			return renderRain(frame)
		case 'none':
			return []
	}
}

// ── Component ─────────────────────────────────────────────────────────────────

type VisualizerProps = {
	active: boolean
	mode: VisualizationMode
}

export function Visualizer({ active, mode }: VisualizerProps) {
	const [frame, setFrame] = useState(0)

	useEffect(() => {
		if (!active || mode === 'none') return

		const interval = setInterval(() => {
			setFrame((f) => f + 1)
		}, 80)

		return () => clearInterval(interval)
	}, [active, mode])

	if (!active || mode === 'none') return <Text dimColor>{BARS[0]!.repeat(WIDTH)}</Text>

	const cells = renderFrame(mode, frame)

	return (
		<Text>
			{cells.map((cell, i) => (
				// eslint-disable-next-line @eslint-react/no-array-index-key -- fixed-width Ink waveform: column position is the cell's identity, and every frame regenerates the whole row
				<Text key={i} color={cell.color}>
					{cell.char}
				</Text>
			))}
		</Text>
	)
}
