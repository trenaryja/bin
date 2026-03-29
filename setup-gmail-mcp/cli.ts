#!/usr/bin/env bun

import { $ } from 'bun'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_CONFIG_DIR = join(homedir(), 'Library', 'Application Support', 'Claude')
const CLAUDE_CONFIG_PATH = join(CLAUDE_CONFIG_DIR, 'claude_desktop_config.json')

async function getKeychainValue(service: string): Promise<string> {
	const result = await $`security find-generic-password -s ${service} -w`.quiet().nothrow()
	if (result.exitCode !== 0) {
		throw new Error(
			`Missing keychain entry "${service}". Add it with:\n` +
				`  security add-generic-password -a "gws-cli" -s "${service}" -w "YOUR_VALUE" -U`,
		)
	}
	return result.text().trim()
}

async function main() {
	console.log('\n🔧 Setting up Gmail MCP server for Claude Desktop\n')

	// Step 1: Read OAuth credentials from macOS keychain
	console.log('Reading OAuth credentials from keychain...')
	const clientId = await getKeychainValue('gws-cli-client-id')
	const clientSecret = await getKeychainValue('gws-cli-client-secret')
	console.log('✓ Credentials loaded from keychain')

	// Step 2: Check/install uv
	const uvCheck = await $`which uv`.quiet().nothrow()
	if (uvCheck.exitCode !== 0) {
		console.log('Installing uv via brew...')
		await $`brew install uv`
		console.log('✓ uv installed')
	} else {
		console.log('✓ uv already installed')
	}

	// Step 3: Persistently install workspace-mcp (avoids uvx cold-start timeouts)
	console.log('Installing workspace-mcp...')
	await $`uv tool install workspace-mcp`.quiet().nothrow()
	console.log('✓ workspace-mcp installed')

	// Step 4: Configure Claude Desktop
	if (!existsSync(CLAUDE_CONFIG_DIR)) {
		mkdirSync(CLAUDE_CONFIG_DIR, { recursive: true })
	}

	let config: Record<string, unknown> = {}
	if (existsSync(CLAUDE_CONFIG_PATH)) {
		config = JSON.parse(readFileSync(CLAUDE_CONFIG_PATH, 'utf-8'))
		console.log('✓ Existing Claude Desktop config found, merging...')
	}

	const mcpServerConfig = {
		'google-workspace': {
			command: join(homedir(), '.local', 'bin', 'workspace-mcp'),
			args: ['--tool-tier', 'complete'],
			env: {
				GOOGLE_OAUTH_CLIENT_ID: clientId,
				GOOGLE_OAUTH_CLIENT_SECRET: clientSecret,
				OAUTHLIB_INSECURE_TRANSPORT: '1',
			},
		},
	}

	config.mcpServers = { ...(config.mcpServers as Record<string, unknown>), ...mcpServerConfig }

	writeFileSync(CLAUDE_CONFIG_PATH, JSON.stringify(config, null, 2))
	console.log('✓ Claude Desktop config updated')

	console.log('\n✅ Done! Next steps:')
	console.log('   1. Restart Claude Desktop (Cmd+Q, reopen)')
	console.log('   2. Start a new chat and use any Gmail tool')
	console.log('   3. It will open a browser to sign in with Google')
	console.log('   4. After that, it just works\n')
}

main().catch((err) => {
	console.error('❌ Setup failed:', err.message)
	process.exit(1)
})
