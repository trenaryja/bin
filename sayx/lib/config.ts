import { homedir } from 'os'
import { join } from 'path'

import { cosmiconfig } from 'cosmiconfig'

import type { SayxConfig } from './types.ts'

import defaults from '../config.default.json'

const MODULE_NAME = 'sayx'

const explorer = cosmiconfig(MODULE_NAME, {
	searchPlaces: [
		`${MODULE_NAME}.config.ts`,
		`.config/${MODULE_NAME}rc.ts`,
		`${MODULE_NAME}.config.mjs`,
		`${MODULE_NAME}.config.js`,
		`${MODULE_NAME}.config.cjs`,
		'package.json',
		`.${MODULE_NAME}rc.json`,
		`.config/${MODULE_NAME}rc.json`,
		`.${MODULE_NAME}rc.yaml`,
		`.${MODULE_NAME}rc.yml`,
		`.config/${MODULE_NAME}rc.yaml`,
		`.${MODULE_NAME}rc`,
	],
	searchStrategy: 'global',
})

function getDefaultConfigPath(): string {
	const xdgConfig = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config')
	return join(xdgConfig, MODULE_NAME, 'config.json')
}

export async function loadConfig(): Promise<{ config: SayxConfig; configPath: string }> {
	// 1. Try cosmiconfig (rc files, config.js, etc.)
	const result = await explorer.search()

	if (result?.config)
		return { config: mergeWithDefaults(result.config), configPath: result.filepath }

	// 2. Try XDG config path directly (cosmiconfig doesn't search here)
	const xdgPath = getDefaultConfigPath()
	try {
		const file = Bun.file(xdgPath)
		if (await file.exists()) {
			const userConfig = await file.json()
			const merged = mergeWithDefaults(userConfig)
			return { config: merged, configPath: xdgPath }
		}
	} catch {
		// corrupted config — fall through to seed
	}

	// 3. No config found — seed defaults
	await seedConfig(xdgPath)
	return { config: defaults as SayxConfig, configPath: xdgPath }
}

function mergeWithDefaults(userConfig: Record<string, unknown>): SayxConfig {
	const merged = { ...defaults, ...userConfig } as Record<string, unknown>
	merged.voices = { ...(defaults as Record<string, unknown>).voices, ...(userConfig.voices as object ?? {}) }
	merged.keybindings = { ...(defaults as Record<string, unknown>).keybindings, ...(userConfig.keybindings as object ?? {}) }

	// Backward compat: old single deterministicPhrase → array
	if (userConfig.deterministicPhrase && !userConfig.deterministicPhrases) {
		merged.deterministicPhrases = [
			userConfig.deterministicPhrase as string,
			...(defaults as { deterministicPhrases: string[] }).deterministicPhrases.slice(1),
		]
	}

	return merged as SayxConfig
}

async function seedConfig(path: string): Promise<void> {
	await Bun.write(path, JSON.stringify(defaults, null, '\t') + '\n')
	console.log(`Created default config at ${path}`)
}

export async function saveConfig(configPath: string, config: SayxConfig): Promise<void> {
	await Bun.write(configPath, JSON.stringify(config, null, '\t') + '\n')
}
