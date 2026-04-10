import { Box, Text } from 'ink'
import React from 'react'

type ModalProps = {
	children: React.ReactNode
	title: string
}

export function Modal({ title, children }: ModalProps) {
	return (
		<Box flexDirection='column' paddingX={2} paddingY={1} borderStyle='round' borderColor='cyan'>
			<Text bold color='cyan'>
				{title}
			</Text>
			<Text> </Text>
			{children}
		</Box>
	)
}
