import type { ZodTypeAny } from 'zod'
import type { FieldMeta, FidelityLoss, FormatCategory } from './types'

/**
 * Get the type string from a Zod schema.
 * Zod 4 uses `_def.type` (string) instead of `_def.typeName` (enum).
 */
function zodType(schema: ZodTypeAny): string {
	return (schema._def.type as string) ?? schema.type ?? ''
}

/** Unwrap Zod wrappers (optional, default, nullable, branded, readonly, catch, effects) to get the inner type */
function unwrap(schema: ZodTypeAny): { inner: ZodTypeAny; isOptional: boolean; defaultValue?: unknown } {
	let isOptional = false
	let defaultValue: unknown = undefined
	let current = schema

	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- loop terminates when no more wrappers
	while (true) {
		const def = current._def
		const type = zodType(current)
		switch (type) {
			case 'optional':
				isOptional = true
				current = def.innerType
				continue
			case 'default':
				defaultValue = typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue
				current = def.innerType
				continue
			case 'nullable':
				isOptional = true
				current = def.innerType
				continue
			case 'branded':
			case 'readonly':
				current = def.innerType ?? def.type
				continue
			case 'catch':
				current = def.innerType
				continue
			case 'effects':
				current = def.schema ?? def.innerType
				continue
			default:
				return { inner: current, isOptional, defaultValue }
		}
	}
}

const COMPLEX_TYPES = new Set(['function', 'date', 'symbol', 'map', 'set'])

/** Extract metadata from a single Zod field */
export function introspectField(name: string, schema: ZodTypeAny): FieldMeta {
	const { inner, isOptional, defaultValue } = unwrap(schema)
	const typeName = zodType(inner)
	const def = inner._def

	const meta: FieldMeta = {
		name,
		typeName,
		description: schema.description ?? inner.description,
		defaultValue,
		isOptional: isOptional || defaultValue !== undefined,
		isFunction: typeName === 'function',
		isDate: typeName === 'date',
		isRegex: typeName === 'string' && def.checks?.some((c: { kind: string }) => c.kind === 'regex'),
		isSymbol: typeName === 'symbol',
		isMap: typeName === 'map',
		isSet: typeName === 'set',
	}

	if (typeName === 'array' && def.element) {
		const elemDef = unwrap(def.element)
		meta.elementType = zodType(elemDef.inner)
	}

	if (typeName === 'object' && (def.shape || inner.shape)) {
		const shape = typeof def.shape === 'function' ? def.shape() : (def.shape ?? inner.shape)
		meta.children = Object.entries(shape as Record<string, ZodTypeAny>).map(([k, v]) => introspectField(k, v))
	}

	if (typeName === 'enum') {
		// Zod 4: enum values via .options or _def.entries
		const options = (inner as { options?: string[] }).options
		if (options) {
			meta.enumValues = options
		} else if (def.entries) {
			meta.enumValues = Object.keys(def.entries as Record<string, string>)
		}
	}

	if (typeName === 'literal') {
		// Zod 4: literal value is in _def.values (array) or .value
		const values = def.values as unknown[]
		meta.literalValue = Array.isArray(values) ? values[0] : (inner as { value?: unknown }).value
	}

	return meta
}

/** Introspect a root Zod object schema to extract all field metadata */
export function introspectSchema(schema: ZodTypeAny): FieldMeta[] {
	const { inner } = unwrap(schema)
	const typeName = zodType(inner)

	if (typeName !== 'object') {
		throw new Error(`Root schema must be a z.object(). Got: ${typeName}`)
	}

	const def = inner._def
	const shape = typeof def.shape === 'function' ? def.shape() : (def.shape ?? inner.shape)
	return Object.entries(shape as Record<string, ZodTypeAny>).map(([name, fieldSchema]) =>
		introspectField(name, fieldSchema),
	)
}

/** Determine fidelity losses for a set of fields in a given format category */
export function analyzeFidelity(fields: FieldMeta[], category: FormatCategory, prefix = ''): FidelityLoss[] {
	const losses: FidelityLoss[] = []

	for (const field of fields) {
		const path = prefix ? `${prefix}.${field.name}` : field.name

		if (category === 'json' || category === 'yaml') {
			if (field.isFunction) {
				losses.push({ field: path, reason: `Functions cannot be represented in ${category.toUpperCase()}` })
			}
			if (field.isSymbol) {
				losses.push({ field: path, reason: `Symbols cannot be represented in ${category.toUpperCase()}` })
			}
			if (field.isMap) {
				losses.push({ field: path, reason: `Map objects cannot be represented in ${category.toUpperCase()}` })
			}
			if (field.isSet) {
				losses.push({ field: path, reason: `Set objects cannot be represented in ${category.toUpperCase()}` })
			}
			if (field.isRegex) {
				losses.push({ field: path, reason: `RegExp patterns are stored as plain strings in ${category.toUpperCase()}` })
			}
		}

		if (category === 'json' && field.isDate) {
			losses.push({ field: path, reason: 'Date objects are serialized as ISO strings in JSON (not revived on parse)' })
		}

		if (field.children) {
			losses.push(...analyzeFidelity(field.children, category, path))
		}
	}

	return losses
}

/** Generate a placeholder/example value for a field */
export function exampleValue(field: FieldMeta): unknown {
	if (field.defaultValue !== undefined) return field.defaultValue
	if (field.literalValue !== undefined) return field.literalValue
	if (field.enumValues?.length) return field.enumValues[0]

	switch (field.typeName) {
		case 'string':
			return ''
		case 'number':
		case 'bigint':
			return 0
		case 'boolean':
			return false
		case 'array':
			return []
		case 'object':
			if (!field.children) return {}
			return Object.fromEntries(field.children.map((c) => [c.name, exampleValue(c)]))
		case 'null':
			return null
		case 'date':
			return new Date().toISOString()
		case 'function':
			return undefined // handled specially in JS/TS generators
		case 'record':
			return {}
		default:
			return null
	}
}

/** Check if any field in the tree uses complex types */
export function hasComplexTypes(fields: FieldMeta[]): boolean {
	return fields.some((f) => COMPLEX_TYPES.has(f.typeName) || (f.children && hasComplexTypes(f.children)))
}
