import type { ZodObject, ZodRawShape } from 'zod'
import type { ConfigDefinition } from './types'

/**
 * Define a cosmigen configuration schema.
 *
 * Usage in your schema file:
 * ```ts
 * import { z } from 'zod'
 * import { defineConfig } from 'cosmigen/define'
 *
 * export default defineConfig({
 *   name: 'myapp',
 *   schema: z.object({
 *     port: z.number().default(3000).describe('Server port'),
 *     host: z.string().default('localhost').describe('Server hostname'),
 *   }),
 * })
 * ```
 */
export function defineConfig<T extends ZodRawShape>(config: {
	name: string
	schema: ZodObject<T>
}): ConfigDefinition {
	return config
}
