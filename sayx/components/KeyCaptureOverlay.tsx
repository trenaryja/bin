import { Box, Text, useInput } from 'ink'
import React, { useEffect, useMemo, useState } from 'react'

import type { KeyCaptureState } from '../lib/key-capture.ts'
import { createKeyCapture } from '../lib/key-capture.ts'

import { Modal } from './Modal.tsx'

type KeyCaptureOverlayProps = {
	actionName: string
	currentKey: string
	onCancel: () => void
	onCapture: (key: string) => void
}

export function KeyCaptureOverlay({ actionName, currentKey, onCapture, onCancel }: KeyCaptureOverlayProps) {
	// eslint-disable-next-line react-hooks/exhaustive-deps -- createKeyCapture returns a stateful object with internal timers that must persist across renders
	const capture = useMemo(() => createKeyCapture({ timeout: 5000 }), [])
	const [displayState, setDisplayState] = useState<KeyCaptureState>('idle')
	const [displayLabel, setDisplayLabel] = useState('')

	useEffect(() => {
		const unsub = capture.onStateChange((state, result) => {
			setDisplayState(state)
			if (result) setDisplayLabel(result.displayLabel)
		})

		capture.start(actionName)

		return unsub
	}, [actionName])

	useInput((input, key) => {
		if (displayState === 'captured') {
			if (key.return) { const result = capture.accept(); if (result) onCapture(result.key) }
			else if (key.escape) { capture.cancel(); onCancel() }
			return
		}
		if (displayState !== 'capturing') return
		if (key.escape) { capture.cancel(); onCancel(); return }
		const result = capture.feed(input, { ctrl: key.ctrl, meta: key.meta, shift: key.shift })
		if (result === 'reserved') setDisplayLabel('Reserved key — try another')
	})

	return (
		<Modal title={`Rebind: ${actionName}`}>
			<Text>
				{'Current binding: '}<Text color='yellow' bold>{currentKey}</Text>
			</Text>
			<Text> </Text>

			{displayState === 'capturing' && (
				<>
					<Text>{'Press any key to set new binding…'}</Text>
					<Text> </Text>
					<Box>
						<Text color='cyan'>{'⏳ Waiting for key input'}</Text>
					</Box>
				</>
			)}

			{displayState === 'captured' && (
				<>
					<Text>{'New binding:'}</Text>
					<Text> </Text>
					<Box>
						<Text color='green' bold>{'  '}{displayLabel}</Text>
					</Box>
					<Text> </Text>
					<Text dimColor>{'Enter to confirm · Esc to cancel'}</Text>
				</>
			)}

			{displayState === 'timeout' && (
				<>
					<Text color='yellow'>{'No key pressed — timed out'}</Text>
					<Text> </Text>
					<Text dimColor>{'Returning…'}</Text>
				</>
			)}

			{displayLabel && displayState === 'capturing' && (
				<>
					<Text> </Text>
					<Text color='red'>{displayLabel}</Text>
				</>
			)}

			<Text> </Text>
			<Text dimColor>{'Esc to cancel · Ctrl+C/Z/D are reserved'}</Text>
		</Modal>
	)
}
