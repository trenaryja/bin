import type { Key } from 'ink'

import type { KeyAction, KeybindingMap } from './types.ts'

type InputMatch = {
	action: KeyAction
}

const SPECIAL_KEY_MAP: Record<string, keyof Key> = {
	enter: 'return',
	return: 'return',
	escape: 'escape',
	up: 'upArrow',
	down: 'downArrow',
	left: 'leftArrow',
	right: 'rightArrow',
	tab: 'tab',
	backspace: 'backspace',
	delete: 'delete',
}

export function matchInput(input: string, key: Key, bindings: KeybindingMap): InputMatch | undefined {
	for (const [action, binding] of Object.entries(bindings) as [KeyAction, string][])
		if (matchesBinding(input, key, binding)) return { action }
	return undefined
}

function matchesBinding(input: string, key: Key, binding: string): boolean {
	// Special keys
	if (binding === 'space') return input === ' '
	if (binding === 'enter' || binding === 'return') return key.return

	const specialKey = SPECIAL_KEY_MAP[binding]
	if (specialKey && key[specialKey]) return true

	// Character keys
	return input === binding
}

export function getBindingLabel(binding: string): string {
	const labels: Record<string, string> = {
		enter: '\u23ce',
		return: '\u23ce',
		space: '\u2423',
		escape: 'Esc',
		up: '\u2191',
		down: '\u2193',
		left: '\u2190',
		right: '\u2192',
		tab: 'Tab',
		backspace: '\u232b',
		delete: 'Del',
	}
	return labels[binding] ?? binding
}
