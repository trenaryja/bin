// cosmigen eats its own dog food — this schema defines cosmigen's own configuration
import { z } from 'zod'
import { defineConfig } from './define'

export default defineConfig({
	name: 'cosmigen',
	schema: z.object({
		schema: z.string().default('cosmigen.config.ts').describe('Path to the Zod schema file'),
		outDir: z.string().default('.').describe('Output directory for generated files'),
		formats: z.enum(['all', 'full-fidelity', 'static']).default('all').describe('Which format set to generate'),
		dryRun: z.boolean().default(false).describe('Preview generated files without writing'),
	}),
})
