// Shared core for map-tile-stats — tile math, fetching, compositing, estimation.

import sharp from 'sharp'

// ── Constants ────────────────────────────────────────────────────────────────

export const TILE_SIZE = 1024
const ACCESS_TOKEN = process.env.MAPBOX_TOKEN
if (!ACCESS_TOKEN) throw new Error('MAPBOX_TOKEN environment variable is required')
const PIXELS_PER_TILE = TILE_SIZE * TILE_SIZE

export const BYTES_PER_PIXEL = { png: 0.45, jpg: 0.23 } as const

// ── Types ────────────────────────────────────────────────────────────────────

export type Format = 'jpg' | 'png'
export type TileBounds = { north: number; south: number; east: number; west: number }
export type TilePiece = { url: string; x: number; y: number }

export type TestResult = {
	name: string
	zoom: number
	tiles: number
	cols: number
	rows: number
	format: Format
	estimated: number
	actual: number
	bpp: number
	error: number
}

export type Location = {
	name: string
	lat: [number, number]
	lng: [number, number]
}

// ── Tile math ────────────────────────────────────────────────────────────────

export const lng2tile = (lng: number, zoom: number) => Math.floor(((lng + 180) / 360) * 2 ** zoom)

export const lat2tile = (lat: number, zoom: number) =>
	Math.floor(
		((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** zoom,
	)

export function locationToBounds(loc: Location, zoom: number): TileBounds {
	return {
		north: lat2tile(loc.lat[0], zoom),
		south: lat2tile(loc.lat[1], zoom),
		west: lng2tile(loc.lng[0], zoom),
		east: lng2tile(loc.lng[1], zoom),
	}
}

export function boundsToGrid(bounds: TileBounds) {
	const cols = Math.abs(bounds.west - bounds.east) + 1
	const rows = Math.abs(bounds.north - bounds.south) + 1
	return { cols, rows }
}

export function enumerateTiles(bounds: TileBounds, zoom: number): TilePiece[] {
	const pieces: TilePiece[] = []

	for (let x = bounds.west; x <= bounds.east; x++) {
		for (let y = bounds.north; y <= bounds.south; y++) {
			pieces.push({
				url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/${zoom}/${x}/${y}@2x?access_token=${ACCESS_TOKEN}`,
				x: x - bounds.west,
				y: y - bounds.north,
			})
		}
	}

	return pieces
}

// ── Estimation ───────────────────────────────────────────────────────────────

export function estimateFileSize(tiles: number, format: Format) {
	return tiles * PIXELS_PER_TILE * BYTES_PER_PIXEL[format]
}

export function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
	if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
	return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

// ── Compositing ──────────────────────────────────────────────────────────────

async function fetchTileBuffer(url: string): Promise<ArrayBuffer> {
	const res = await fetch(url)
	if (!res.ok) throw new Error(`Tile fetch failed: ${res.status}`)
	return res.arrayBuffer()
}

type ProgressCallback = (done: number, total: number) => void

export type ComposeTilesOptions = {
	bounds: TileBounds
	format: Format
	onProgress?: ProgressCallback
	zoom: number
}

export async function composeTiles({ bounds, zoom, format, onProgress }: ComposeTilesOptions): Promise<Buffer> {
	const { cols, rows } = boundsToGrid(bounds)
	const pieces = enumerateTiles(bounds, zoom)
	const total = pieces.length
	const composites: sharp.OverlayOptions[] = []
	const concurrency = 12

	// Batched rather than one big Promise.all: awaiting each batch is the backpressure
	// that keeps us from opening `total` connections to the tile server at once.
	for (let i = 0; i < pieces.length; i += concurrency) {
		const batch = await Promise.all(
			pieces.slice(i, i + concurrency).map(async (piece) => {
				const buf = await fetchTileBuffer(piece.url)
				return { input: Buffer.from(buf), left: piece.x * TILE_SIZE, top: piece.y * TILE_SIZE }
			}),
		)
		composites.push(...batch)
		onProgress?.(Math.min(i + concurrency, total), total)
	}

	const canvas = sharp({
		create: {
			width: cols * TILE_SIZE,
			height: rows * TILE_SIZE,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		},
	}).composite(composites)

	if (format === 'jpg') return canvas.jpeg({ quality: 92 }).toBuffer()
	return canvas.png().toBuffer()
}

// ── Test runner ──────────────────────────────────────────────────────────────

export type RunTestOptions = {
	bounds: TileBounds
	label: string
	onProgress?: ProgressCallback
	zoom: number
}

export async function runTest({ bounds, zoom, label, onProgress }: RunTestOptions): Promise<TestResult[]> {
	const { cols, rows } = boundsToGrid(bounds)
	const tileCount = cols * rows
	const results: TestResult[] = []

	for (const format of ['png', 'jpg'] as const) {
		const estimated = estimateFileSize(tileCount, format)
		const buf = await composeTiles({ bounds, zoom, format, onProgress })
		const actual = buf.length
		const bpp = actual / (tileCount * PIXELS_PER_TILE)
		const error = (actual / estimated - 1) * 100
		results.push({ name: label, zoom, tiles: tileCount, cols, rows, format, estimated, actual, bpp, error })
	}

	return results
}

// ── Built-in locations ───────────────────────────────────────────────────────

export const LOCATIONS: Location[] = [
	{ name: 'Manhattan', lat: [40.8, 40.72], lng: [-74.02, -73.95] },
	{ name: 'Paris', lat: [48.88, 48.83], lng: [2.28, 2.38] },
	{ name: 'Tokyo', lat: [35.68, 35.64], lng: [139.68, 139.72] },
	{ name: 'Hong Kong', lat: [22.32, 22.27], lng: [114.14, 114.2] },
	{ name: 'Grand Canyon', lat: [36.22, 36.03], lng: [-112.25, -112.0] },
	{ name: 'Yosemite', lat: [37.76, 37.71], lng: [-119.64, -119.55] },
	{ name: 'Niagara Falls', lat: [43.1, 43.07], lng: [-79.08, -79.05] },
	{ name: 'Mt Fuji', lat: [35.4, 35.33], lng: [138.7, 138.8] },
	{ name: 'Yellowstone', lat: [44.48, 44.44], lng: [-110.86, -110.8] },
	{ name: 'Sydney', lat: [-33.84, -33.87], lng: [151.19, 151.24] },
	{ name: 'Rio', lat: [-22.94, -22.98], lng: [-43.2, -43.15] },
	{ name: 'Venice', lat: [45.45, 45.42], lng: [12.31, 12.36] },
	{ name: 'Dubai', lat: [25.24, 25.17], lng: [55.24, 55.32] },
	{ name: 'Phoenix', lat: [33.52, 33.42], lng: [-112.1, -111.95] },
]
