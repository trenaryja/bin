import { daisyThemeMap, tailwindColors } from '@trenaryja/ui'
import chroma from 'chroma-js'

type DaisyTheme = (typeof daisyThemeMap)[keyof typeof daisyThemeMap]

function oklchToHex(oklch: string): string {
	return chroma(oklch).hex()
}

function themeColor(theme: DaisyTheme, key: string): string {
	const value = theme.theme[`--color-${key}` as keyof typeof theme.theme]
	return value ? oklchToHex(value) : '#ffffff'
}

type TailwindShades = (typeof tailwindColors)[keyof typeof tailwindColors]

function tw(name: keyof typeof tailwindColors, shade: keyof TailwindShades): string {
	const shades = tailwindColors[name]
	return shades ? oklchToHex(shades[shade]) : '#ffffff'
}

// ── Theme ───────────────────────────────────────────────────────────────────

const theme = daisyThemeMap.dark

export const ui = {
	primary: themeColor(theme, 'primary'),
	secondary: themeColor(theme, 'secondary'),
	accent: themeColor(theme, 'accent'),
	info: themeColor(theme, 'info'),
	success: themeColor(theme, 'success'),
	warning: themeColor(theme, 'warning'),
	error: themeColor(theme, 'error'),
	muted: themeColor(theme, 'neutral-content'),
	text: themeColor(theme, 'base-content'),
}

// ── File extension colors ───────────────────────────────────────────────────

export const EXT_COLORS: Record<string, string> = {
	// code
	ts: tw('cyan', '400'),
	tsx: tw('cyan', '400'),
	js: tw('yellow', '400'),
	jsx: tw('yellow', '400'),
	rs: tw('orange', '400'),
	go: tw('sky', '400'),
	py: tw('blue', '400'),
	rb: tw('red', '400'),
	// data
	json: tw('gray', '400'),
	yaml: tw('gray', '400'),
	yml: tw('gray', '400'),
	toml: tw('gray', '400'),
	csv: tw('gray', '400'),
	xml: tw('gray', '400'),
	// media
	png: tw('fuchsia', '400'),
	jpg: tw('fuchsia', '400'),
	jpeg: tw('fuchsia', '400'),
	gif: tw('fuchsia', '400'),
	svg: tw('fuchsia', '400'),
	mp4: tw('fuchsia', '400'),
	mp3: tw('fuchsia', '400'),
	wav: tw('fuchsia', '400'),
	// docs
	md: tw('neutral', '400'),
	txt: tw('neutral', '400'),
	pdf: tw('red', '400'),
	// archives
	zip: tw('red', '400'),
	tar: tw('red', '400'),
	gz: tw('red', '400'),
	dmg: tw('red', '400'),
	// build
	o: tw('gray', '400'),
	d: tw('gray', '400'),
	wasm: tw('green', '400'),
}

export function getFileColor(name: string, isDir: boolean): string | undefined {
	if (isDir) return ui.info
	const dot = name.lastIndexOf('.')
	if (dot === -1) return undefined
	return EXT_COLORS[name.slice(dot + 1)]
}
