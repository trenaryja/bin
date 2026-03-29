/**
 * emuse common schema — the platform-agnostic representation of music metadata.
 *
 * Design principles:
 * - Only fields confirmed present in at least 2 of 3 providers (Spotify, YouTube Music, Apple Music)
 * - Provider-unique fields (e.g. Spotify audio features, Apple Music spatial audio) belong in
 *   provider-specific raw types, NOT here
 * - JSDoc comments note provider availability and lossy/lossless translation concerns
 *
 * API references used:
 * - Spotify Web API: GET /v1/tracks/{id}, GET /v1/playlists/{id}, GET /v1/me
 * - YouTube Data API v3: videos, playlists, playlistItems resources
 * - Apple Music API: Songs, Albums, Artists, Playlists resource types
 *
 * Source-of-truth SDKs for provider-specific raw types:
 * - YouTube Data API v3: `@googleapis/youtube` (official Google-published SDK, fully typed)
 * - YouTube Music (unofficial): `youtubei.js` — an unofficial InnerTube wrapper, NOT a Google
 *   product. Can break without notice when Google changes internal APIs. Provides richer data
 *   than the official API: album resources, artist genres (sometimes), and better artist/track
 *   relationships. However, ISRC is still NOT available even through the unofficial API.
 * - Spotify: `@spotify/web-api-ts-sdk` (official Spotify-published SDK, fully typed)
 * - Apple Music: REST API with `@types/apple-music-api` (community types from DefinitelyTyped)
 */

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Supported music platform identifiers. */
export type ProviderType = 'spotify' | 'youtube-music' | 'apple-music';

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

/** A single image resource (artwork, thumbnail, profile picture, etc.). */
export interface Image {
  /** Direct URL to the image. Available on all three providers. */
  url: string;

  /**
   * Width in pixels.
   * - Spotify: always provided for album/playlist art
   * - YouTube: provided for all thumbnail sizes
   * - Apple Music: provided; URL is a template — width/height are substituted at request time
   */
  width: number | null;

  /**
   * Height in pixels. Same availability notes as `width`.
   */
  height: number | null;
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

export interface Artist {
  /** Provider-specific unique identifier for the artist. */
  id: string;

  /** Artist display name. Universal across all providers. */
  name: string;

  /**
   * URL to the artist's page on the originating platform.
   * - Spotify: `external_urls.spotify`
   * - YouTube: channel URL derived from `channelId`
   * - Apple Music: `attributes.url`
   */
  url: string | null;

  /**
   * Artist images / artwork.
   * - Spotify: available via GET /v1/artists/{id} (not inline on track.artists)
   * - YouTube: channel thumbnails (requires separate channels.list call)
   * - Apple Music: `attributes.artwork`
   *
   * Because Spotify and YouTube don't include artist images inline with track
   * responses, this may be empty when hydrated from a playlist/track fetch.
   */
  images: Image[];

  /**
   * Genre names associated with this artist.
   * - Spotify: available on full artist object (`genres` array of strings)
   * - Apple Music: `attributes.genreNames`
   * - YouTube: official API has no genre metadata on channels; youtubei.js may provide
   *   artist genres in some cases (unofficial API, inconsistent availability)
   *
   * Lossy: YouTube official API has no artist genres. youtubei.js sometimes provides them
   * but coverage is inconsistent — expect `[]` in many cases.
   */
  genres: string[];

  /** Which provider this data was sourced from. */
  provider: ProviderType;

  /** The raw provider-specific ID (same as `id`, kept explicit for clarity in mappings). */
  providerId: string;
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

export interface Album {
  /** Provider-specific unique identifier for the album. */
  id: string;

  /** Album title. Universal across all providers. */
  name: string;

  /**
   * The type/category of the album.
   * - Spotify: `album_type` — "album" | "single" | "compilation"
   * - Apple Music: not a direct field, but singles vs albums are separate resource queries
   * - YouTube: YouTube Data API v3 has no album resource; YouTube Music albums are accessible
   *   via unofficial InnerTube libraries (youtubei.js). Album data from YouTube Music is sourced
   *   from the unofficial API. Album type may not be reliably available.
   *
   * Lossy: YouTube Music album type mapping is best-effort. When sourced from YouTube, this may be null.
   */
  albumType: 'album' | 'single' | 'compilation' | null;

  /**
   * Artist name(s) for the album.
   * - Spotify: `artists` array on album object
   * - Apple Music: `attributes.artistName` (single string)
   * - YouTube: available via youtubei.js album data (unofficial API)
   */
  artistName: string;

  /** Total number of tracks on the album.
   * - Spotify: `total_tracks`
   * - Apple Music: `attributes.trackCount`
   * - YouTube: available via youtubei.js album data (unofficial API)
   */
  totalTracks: number | null;

  /**
   * Release date as an ISO 8601 string. Precision varies:
   * - Spotify: `release_date` with `release_date_precision` ("year" | "month" | "day")
   * - Apple Music: `attributes.releaseDate` (YYYY-MM-DD)
   * - YouTube: available via youtubei.js album data (unofficial API); precision varies
   *
   * Lossy: Spotify may only have year or year-month precision. YouTube Music release dates
   * may have inconsistent precision.
   */
  releaseDate: string | null;

  /**
   * Album artwork / cover images.
   * - Spotify: `images` array (up to 3 sizes)
   * - Apple Music: `attributes.artwork`
   * - YouTube: available via youtubei.js album data (unofficial API)
   */
  images: Image[];

  /**
   * Genre names for the album.
   * - Spotify: `genres` (often empty for albums; more reliable on artist)
   * - Apple Music: `attributes.genreNames`
   * - YouTube: available via youtubei.js album data (unofficial API); may be sparse
   */
  genres: string[];

  /**
   * URL to the album on the originating platform.
   * - Spotify: `external_urls.spotify`
   * - Apple Music: `attributes.url`
   * - YouTube: derivable from YouTube Music album browse ID via youtubei.js
   */
  url: string | null;

  /** Which provider this data was sourced from. */
  provider: ProviderType;

  /** The raw provider-specific ID. */
  providerId: string;
}

// ---------------------------------------------------------------------------
// Track
// ---------------------------------------------------------------------------

export interface Track {
  /** Provider-specific unique identifier for the track. */
  id: string;

  /** Track title. Universal across all providers. */
  name: string;

  /**
   * Artists who performed the track.
   * - Spotify: `artists` array with id, name, uri
   * - Apple Music: `attributes.artistName` (single string — must be split or wrapped)
   * - YouTube: `snippet.videoOwnerChannelTitle` or `snippet.channelTitle` (single string)
   *
   * Note: Apple Music and YouTube only provide a single artist string, not structured
   * artist objects. The mapper must construct a minimal Artist with just the name.
   * This is a lossy translation from those providers.
   */
  artists: Artist[];

  /**
   * The album this track belongs to.
   * - Spotify: full `album` object inline on track
   * - Apple Music: `attributes.albumName` (string only; full album via relationship)
   * - YouTube: YouTube Data API v3 has no album resource; YouTube Music albums are accessible
   *   via unofficial InnerTube libraries (youtubei.js). Album data from YouTube Music is sourced
   *   from the unofficial API.
   *
   * Lossy: YouTube tracks from the official API will have a null album; youtubei.js can
   * provide album data. Apple Music tracks will have a minimal album (name only) unless
   * the album relationship is explicitly fetched.
   */
  album: Album | null;

  /**
   * Track duration in milliseconds.
   * - Spotify: `duration_ms`
   * - Apple Music: `attributes.durationInMillis`
   * - YouTube: `contentDetails.duration` (ISO 8601 duration, e.g. "PT3M45S" — must be converted)
   *
   * Lossless across all providers (after ISO 8601 conversion for YouTube).
   */
  durationMs: number;

  /**
   * Track number within its album/disc.
   * - Spotify: `track_number`
   * - Apple Music: `attributes.trackNumber`
   * - YouTube: available via youtubei.js when track is fetched in album context (unofficial API)
   *
   * Lossy from YouTube official API; youtubei.js may provide track numbers within albums.
   */
  trackNumber: number | null;

  /**
   * Disc number within a multi-disc album.
   * - Spotify: `disc_number`
   * - Apple Music: `attributes.discNumber`
   * - YouTube: not reliably available even via youtubei.js
   *
   * Lossy from YouTube.
   */
  discNumber: number | null;

  /**
   * Whether the track has explicit content.
   * - Spotify: `explicit` boolean
   * - Apple Music: `attributes.contentRating` === "explicit"
   * - YouTube: not reliably available
   *
   * Lossy from YouTube. Spotify's `explicit: false` may mean "no" OR "unknown".
   */
  explicit: boolean | null;

  /**
   * International Standard Recording Code — the universal music identifier.
   * - Spotify: `external_ids.isrc`
   * - Apple Music: `attributes.isrc`
   * - YouTube: not available — NOT available even via youtubei.js (unofficial API)
   *
   * ISRC is critical for cross-platform track matching. YouTube lacks it entirely
   * (both official API and unofficial InnerTube), so matching YouTube tracks to other
   * providers requires fuzzy name/artist/duration matching.
   *
   * Lossy from YouTube.
   */
  isrc: string | null;

  /**
   * URL to the track on the originating platform.
   * - Spotify: `external_urls.spotify`
   * - Apple Music: `attributes.url`
   * - YouTube: derived from video ID (`https://www.youtube.com/watch?v={videoId}`)
   *
   * Lossless across all providers.
   */
  url: string | null;

  /**
   * Track artwork / thumbnail.
   * - Spotify: inherited from album images (no track-level artwork)
   * - Apple Music: `attributes.artwork` (track-level)
   * - YouTube: `snippet.thumbnails` (video thumbnail)
   *
   * Note: Spotify does not have track-level artwork — only album art.
   * The mapper should fall back to album images for Spotify tracks.
   */
  images: Image[];

  /**
   * Genre names.
   * - Spotify: not on track object directly (available on artist)
   * - Apple Music: `attributes.genreNames`
   * - YouTube: `snippet.categoryId` (numeric, not genre names)
   *
   * Lossy from Spotify (must fetch from artist) and YouTube (category != genre).
   */
  genres: string[];

  /**
   * Release date as an ISO 8601 string.
   * - Spotify: from album's `release_date`
   * - Apple Music: `attributes.releaseDate`
   * - YouTube: `snippet.publishedAt` (upload date, NOT the song's release date)
   *
   * Lossy from YouTube — publishedAt is when the video was uploaded, not the
   * song's actual release date. These can differ significantly.
   */
  releaseDate: string | null;

  /** Which provider this data was sourced from. */
  provider: ProviderType;

  /** The raw provider-specific ID. */
  providerId: string;
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

export interface Playlist {
  /** Provider-specific unique identifier for the playlist. */
  id: string;

  /** Playlist name/title. Universal across all providers. */
  name: string;

  /**
   * Playlist description.
   * - Spotify: `description` (only for modified/verified playlists; may be null)
   * - YouTube: `snippet.description`
   * - Apple Music: `attributes.description.standard` (may be absent)
   *
   * Lossless when present; may be empty/null on any provider.
   */
  description: string | null;

  /**
   * Playlist cover images / artwork.
   * - Spotify: `images` array (up to 3 sizes; may be auto-generated mosaic)
   * - YouTube: `snippet.thumbnails` (keyed by resolution)
   * - Apple Music: `attributes.artwork`
   *
   * Lossless across all providers.
   */
  images: Image[];

  /**
   * Display name of the playlist owner/creator.
   * - Spotify: `owner.display_name`
   * - YouTube: `snippet.channelTitle`
   * - Apple Music: `attributes.curatorName`
   */
  ownerName: string | null;

  /**
   * Whether the playlist is publicly visible.
   * - Spotify: `public` (true | false | null)
   * - YouTube: `status.privacyStatus` ("public" | "private" | "unlisted")
   * - Apple Music: not directly exposed (catalog playlists are public; library playlists are private)
   *
   * Lossy: YouTube has an "unlisted" state that maps ambiguously to a boolean.
   * Apple Music library playlists are always private. Mapped as best-effort boolean.
   */
  isPublic: boolean | null;

  /**
   * Whether the playlist supports collaborative editing.
   * - Spotify: `collaborative` boolean
   * - YouTube: not supported
   * - Apple Music: not supported
   *
   * Lossy from YouTube and Apple Music (always null/false).
   */
  isCollaborative: boolean;

  /**
   * Total number of tracks in the playlist.
   * - Spotify: `tracks.total`
   * - YouTube: `contentDetails.itemCount`
   * - Apple Music: derived from tracks relationship count
   *
   * Lossless across all providers.
   */
  totalTracks: number;

  /**
   * The tracks in the playlist. May be empty if only metadata was fetched.
   * Populated by a separate "get playlist tracks" call on most providers.
   */
  tracks: Track[];

  /**
   * URL to the playlist on the originating platform.
   * - Spotify: `external_urls.spotify`
   * - YouTube: derived from playlist ID
   * - Apple Music: `attributes.url`
   */
  url: string | null;

  /** Which provider this data was sourced from. */
  provider: ProviderType;

  /** The raw provider-specific ID. */
  providerId: string;
}

// ---------------------------------------------------------------------------
// User Profile
// ---------------------------------------------------------------------------

export interface UserProfile {
  /** Provider-specific user identifier. */
  id: string;

  /**
   * Display name.
   * - Spotify: `display_name`
   * - YouTube: channel title from `snippet.title`
   * - Apple Music: not available via API (Apple Music API has no user profile endpoint)
   *
   * Lossy from Apple Music.
   */
  displayName: string | null;

  /**
   * User's email address.
   * - Spotify: `email` (requires `user-read-email` scope)
   * - YouTube: available via Google OAuth userinfo
   * - Apple Music: not available
   *
   * Lossy from Apple Music. Requires explicit scope on Spotify.
   */
  email: string | null;

  /**
   * Profile images.
   * - Spotify: `images` array
   * - YouTube: channel thumbnails
   * - Apple Music: not available
   *
   * Lossy from Apple Music.
   */
  images: Image[];

  /**
   * URL to the user's profile on the platform.
   * - Spotify: `external_urls.spotify`
   * - YouTube: channel URL
   * - Apple Music: not available
   */
  url: string | null;

  /** Which provider this profile was sourced from. */
  provider: ProviderType;

  /** The raw provider-specific ID. */
  providerId: string;
}

// ---------------------------------------------------------------------------
// Connection (linked provider account)
// ---------------------------------------------------------------------------

/**
 * Represents a linked music service account — one user may have multiple connections.
 * This is an emuse-internal type for auth/account management, not a provider API type.
 */
export interface Connection {
  /** Unique connection identifier (internal to emuse). */
  id: string;

  /** Which provider this connection is for. */
  provider: ProviderType;

  /** Provider-specific user/account ID. */
  providerAccountId: string;

  /**
   * Display label for this connection (e.g. the user's display name on that platform).
   * Used in the CLI to let the user distinguish between connections.
   */
  displayName: string | null;

  /** OAuth access token. */
  accessToken: string;

  /** OAuth refresh token (if the provider supports token refresh). */
  refreshToken: string | null;

  /**
   * Token expiration timestamp (ms since epoch).
   * - Spotify: tokens expire in 1 hour
   * - YouTube/Google: tokens expire in 1 hour
   * - Apple Music: developer tokens expire based on JWT `exp`; Music User Tokens have their own expiry
   */
  expiresAt: number | null;

  /** OAuth scopes granted for this connection. */
  scopes: string[];

  /** When this connection was first established. */
  createdAt: Date;

  /** When the tokens were last refreshed. */
  updatedAt: Date;
}
