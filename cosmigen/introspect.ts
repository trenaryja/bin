import type { core, ZodType } from 'zod'
import type { FidelityLoss, FieldMeta, FormatCategory } from './types'

/**
 * Zod 4 reaches a schema's definition through `.def`, but types it as the base
 * `$ZodTypeDef`, where only `type` is available. Widening to the `$ZodTypes`
 * union restores the per-type definitions, so every access below narrows on
 * `def.type` instead of asserting a shape.
 */
type SchemaDef = core.$ZodTypes['_zod']['def']

type CheckDef = core.$ZodChecks['_zod']['def']

const defOf = (schema: ZodType) => schema.def as SchemaDef

/**
 * Schemas reached through a definition are typed as core schemas, but anything
 * built with `z.*` is a classic one — which is what carries `.description`.
 */
const classic = (schema: core.$ZodType) => schema as ZodType

/** `.default()` accepts a value or a getter; the definition stores whichever was given. */
const resolveDefault = (value: unknown) => (typeof value === 'function' ? (value as () => unknown)() : value)

/** Unwrap Zod wrappers (optional, default, nullable, readonly, catch, pipe, lazy) to get the inner type */
function unwrap(schema: ZodType): { inner: ZodType; isOptional: boolean; defaultValue?: unknown } {
	let isOptional = false
	let defaultValue: unknown
	let current = schema

	while (true) {
		const def = defOf(current)

		// eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- unwrap only peels Zod's wrapper types; the ~30 leaf types are the loop's exit condition, not missing cases
		switch (def.type) {
			case 'optional':
			case 'nullable':
				isOptional = true
				current = classic(def.innerType)
				continue
			case 'default':
			case 'prefault':
				defaultValue = resolveDefault(def.defaultValue)
				current = classic(def.innerType)
				continue
			case 'catch':
			case 'nonoptional':
			case 'readonly':
				current = classic(def.innerType)
				continue
			case 'pipe':
				// `.transform()` wraps the source schema in a pipe; the input side is
				// what a config file actually has to contain.
				current = classic(def.in)
				continue
			case 'lazy':
				current = classic(def.getter())
				continue
			default:
				return { inner: current, isOptional, defaultValue }
		}
	}
}

/** `z.string().regex()` records a `string_format` check tagged `regex`. */
function hasRegexCheck(def: SchemaDef): boolean {
	if (def.type !== 'string') return false

	return (def.checks ?? []).some((check) => {
		const checkDef = check._zod.def as CheckDef
		return checkDef.check === 'string_format' && checkDef.format === 'regex'
	})
}

function shapeToFields(shape: Record<string, core.$ZodType>): FieldMeta[] {
	return Object.entries(shape).map(([key, value]) => introspectField(key, classic(value)))
}

const COMPLEX_TYPES = new Set(['date', 'function', 'map', 'set', 'symbol'])

/** Extract metadata from a single Zod field */
export function introspectField(name: string, schema: ZodType): FieldMeta {
	const { inner, isOptional, defaultValue } = unwrap(schema)
	const def = defOf(inner)
	const typeName = def.type

	const meta: FieldMeta = {
		name,
		typeName,
		description: schema.description ?? inner.description,
		defaultValue,
		isOptional: isOptional || defaultValue !== undefined,
		isFunction: typeName === 'function',
		isDate: typeName === 'date',
		isRegex: hasRegexCheck(def),
		isSymbol: typeName === 'symbol',
		isMap: typeName === 'map',
		isSet: typeName === 'set',
	}

	if (def.type === 'array') meta.elementType = unwrap(classic(def.element)).inner.type
	if (def.type === 'object') meta.children = shapeToFields(def.shape)
	if (def.type === 'enum') meta.enumValues = Object.values(def.entries).filter((value) => typeof value === 'string')
	if (def.type === 'literal') meta.literalValue = def.values[0]

	return meta
}

/** Introspect a root Zod object schema to extract all field metadata */
export function introspectSchema(schema: ZodType): FieldMeta[] {
	const def = defOf(unwrap(schema).inner)

	if (def.type !== 'object') {
		throw new Error(`Root schema must be a z.object(). Got: ${def.type}`)
	}

	return shapeToFields(def.shape)
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
