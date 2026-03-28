#!/usr/bin/env bun
import { render } from 'ink'
import React from 'react'

import { App } from './components/App.tsx'
import { loadConfig } from './lib/config.ts'
import { loadSystemVoices } from './lib/voices.ts'

async function main() {
	const [voices, { config, configPath }] = await Promise.all([loadSystemVoices(), loadConfig()])

	if (voices.length === 0) {
		console.error('No voices found. Is macOS speech synthesis available?')
		process.exit(1)
	}

	const { waitUntilExit } = render(<App allVoices={voices} config={config} configPath={configPath} />)
	await waitUntilExit()
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
