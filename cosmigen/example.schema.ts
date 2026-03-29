// Example schema demonstrating all supported Zod types and fidelity characteristics
import { z } from 'zod'
import { defineConfig } from './define'

export default defineConfig({
	name: 'myapp',
	schema: z.object({
		// Primitive types — full fidelity in all formats
		port: z.number().default(3000).describe('Server port to listen on'),
		host: z.string().default('localhost').describe('Hostname for the server'),
		debug: z.boolean().default(false).describe('Enable debug logging'),

		// Array — full fidelity in all formats
		plugins: z.array(z.string()).default(['auth', 'logger']).describe('Active plugins'),

		// Enum — full fidelity in all formats
		logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info').describe('Minimum log level'),

		// Nested object — full fidelity in all formats (if children are simple)
		database: z
			.object({
				url: z.string().default('postgres://localhost:5432/myapp').describe('Connection string'),
				pool: z.number().default(10).describe('Max pool connections'),
				ssl: z.boolean().default(false).describe('Enable SSL'),
			})
			.describe('Database configuration'),

		// Function — only in JS/TS formats (omitted from JSON/YAML)
		onReady: z.function().optional().describe('Callback invoked when the server is ready'),

		// Date — serialized as ISO string in JSON, native in YAML, Date object in JS/TS
		createdAt: z.date().optional().describe('Configuration creation timestamp'),

		// Set — only in JS/TS formats (omitted from JSON/YAML)
		allowedOrigins: z.set(z.string()).optional().describe('CORS allowed origins'),
	}),
})
