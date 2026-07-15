const DJT_SPOTIFY_CLIENT_ID = '00b9c89802ff42b088a25a636c9e9d61';
const DJT_SPOTIFY_TOKEN_KEY = 'djt_spotify_access_token';
const DJT_SPOTIFY_TOKEN_EXPIRES_KEY = 'djt_spotify_token_expires_at';
const DJT_SPOTIFY_VERIFIER_KEY = 'djt_spotify_code_verifier';
const DJT_PLAYLIST_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');
const DJT_CATALOG_DB_NAME = 'djt_catalog';
const DJT_CATALOG_DB_VERSION = 1;
const DJT_CATALOG_STORE = 'snapshots';

const playlistAuthorizeButton = document.getElementById('playlistAuthorizeButton');
const syncSpotifyPlaylistsButton = document.getElementById('syncSpotifyPlaylistsButton');
const playlistSyncStatus = document.getElementById('playlistSyncStatus');
const playlistCatalogSummary = document.getElementById('playlistCatalogSummary');
const playlistCatalogList = document.getElementById('playlistCatalogList');

initializePlaylistCatalog();

playlistAuthorizeButton?.addEventListener('click', async () => {
  try {
    await authorizeSpotifyForPlaylists();
  } catch (error) {
    setPlaylistStatus(`Spotify authorization error: ${error.message}`);
  }
});

syncSpotifyPlaylistsButton?.addEventListener('click', async () => {
  await syncSpotifyPlaylists();
});

async function initializePlaylistCatalog() {
  try {
    const catalog = await loadCatalog();
    renderCatalog(catalog);
  } catch (error) {
    setPlaylistStatus(`Could not open the local catalog: ${error.message}`);
  }
}

async function authorizeSpotifyForPlaylists() {
  const verifier = generatePlaylistVerifier(64);
  const challenge = await createPlaylistChallenge(verifier);
  sessionStorage.setItem(DJT_SPOTIFY_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: DJT_SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: getPlaylistRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: DJT_PLAYLIST_SCOPES,
    show_dialog: 'true'
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function syncSpotifyPlaylists() {
  const token = getPlaylistSpotifyToken();
  if (!token) {
    setPlaylistStatus('Reconnect Spotify for playlist access, then run the sync again.');
    return;
  }

  setSyncBusy(true);
  setPlaylistStatus('Loading your Spotify playlists…');

  try {
    const playlistRows = await fetchAllSpotifyPages(
      'https://api.spotify.com/v1/me/playlists?limit=50',
      token
    );

    const playlists = [];
    let importedTrackEntries = 0;
    let unavailableEntries = 0;
    const uniqueTrackIds = new Set();

    for (let index = 0; index < playlistRows.length; index += 1) {
      const playlist = playlistRows[index];
      setPlaylistStatus(`Loading playlist ${index + 1} of ${playlistRows.length}: ${playlist.name}`);

      const endpoint = playlist.tracks?.href
        || `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlist.id)}/tracks?limit=100`;
      const entries = await fetchAllSpotifyPages(endpoint, token);
      const tracks = [];

      for (const entry of entries) {
        const track = entry?.track || entry?.item || entry;
        if (!track || track.type === 'episode' || track.is_local) {
          unavailableEntries += 1;
          continue;
        }

        importedTrackEntries += 1;
        if (track.id) uniqueTrackIds.add(track.id);
        tracks.push({
          id: track.id || null,
          uri: track.uri || null,
          name: track.name || 'Unknown track',
          artists: Array.isArray(track.artists)
            ? track.artists.map((artist) => ({ id: artist.id || null, name: artist.name || 'Unknown artist' }))
            : [],
          album: track.album
            ? { id: track.album.id || null, name: track.album.name || 'Unknown album' }
            : null,
          duration_ms: Number(track.duration_ms) || 0,
          explicit: Boolean(track.explicit),
          added_at: entry?.added_at || null,
          added_by: entry?.added_by?.id || null
        });
      }

      playlists.push({
        id: playlist.id,
        name: playlist.name || 'Untitled playlist',
        description: playlist.description || '',
        owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown owner',
        collaborative: Boolean(playlist.collaborative),
        public: playlist.public,
        snapshot_id: playlist.snapshot_id || null,
        spotify_url: playlist.external_urls?.spotify || null,
        image_url: playlist.images?.[0]?.url || null,
        tracks
      });
    }

    const catalog = {
      id: 'spotify-playlists',
      source: 'spotify',
      synced_at: new Date().toISOString(),
      playlist_count: playlists.length,
      track_entry_count: importedTrackEntries,
      unique_track_count: uniqueTrackIds.size,
      unavailable_entry_count: unavailableEntries,
      playlists
    };

    await saveCatalog(catalog);
    renderCatalog(catalog);
    setPlaylistStatus(
      `Sync complete: ${catalog.playlist_count} playlists, ${catalog.track_entry_count} track entries, ${catalog.unique_track_count} unique tracks.`
    );
  } catch (error) {
    setPlaylistStatus(`Playlist sync error: ${error.message}`);
  } finally {
    setSyncBusy(false);
  }
}

async function fetchAllSpotifyPages(initialUrl, token) {
  const items = [];
  let url = initialUrl;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
      localStorage.removeItem(DJT_SPOTIFY_TOKEN_KEY);
      localStorage.removeItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY);
      throw new Error('Your Spotify session expired. Reconnect Spotify and try again.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('Spotify has not granted playlist access. Tap Reconnect Spotify for Playlists.');
      }
      throw new Error(data.error?.message || `Spotify returned HTTP ${response.status}.`);
    }

    if (Array.isArray(data.items)) items.push(...data.items);
    url = data.next || null;
  }

  return items;
}

function getPlaylistSpotifyToken() {
  const token = localStorage.getItem(DJT_SPOTIFY_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY) || 0);
  if (!token || !expiresAt || Date.now() >= expiresAt) return null;
  return token;
}

function getPlaylistRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function setSyncBusy(isBusy) {
  if (syncSpotifyPlaylistsButton) syncSpotifyPlaylistsButton.disabled = isBusy;
  if (playlistAuthorizeButton) playlistAuthorizeButton.disabled = isBusy;
}

function setPlaylistStatus(message) {
  if (playlistSyncStatus) playlistSyncStatus.textContent = message;
}

function renderCatalog(catalog) {
  if (!playlistCatalogSummary || !playlistCatalogList) return;

  if (!catalog?.playlists?.length) {
    playlistCatalogSummary.textContent = 'No playlists have been synced yet.';
    playlistCatalogList.textContent = '';
    return;
  }

  const synced = new Date(catalog.synced_at).toLocaleString();
  playlistCatalogSummary.textContent = `${catalog.playlist_count} playlists • ${catalog.track_entry_count} track entries • ${catalog.unique_track_count} unique tracks • Synced ${synced}`;
  playlistCatalogList.innerHTML = catalog.playlists
    .map((playlist) => `
      <li>
        <strong>${escapePlaylistHtml(playlist.name)}</strong>
        <span>${playlist.tracks.length} tracks</span>
      </li>
    `)
    .join('');
}

function openCatalogDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DJT_CATALOG_DB_NAME, DJT_CATALOG_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DJT_CATALOG_STORE)) {
        db.createObjectStore(DJT_CATALOG_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB could not be opened.'));
  });
}

async function saveCatalog(catalog) {
  const db = await openCatalogDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(DJT_CATALOG_STORE, 'readwrite');
    transaction.objectStore(DJT_CATALOG_STORE).put(catalog);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Catalog save failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Catalog save was aborted.'));
  });
  db.close();
}

async function loadCatalog() {
  const db = await openCatalogDatabase();
  const catalog = await new Promise((resolve, reject) => {
    const transaction = db.transaction(DJT_CATALOG_STORE, 'readonly');
    const request = transaction.objectStore(DJT_CATALOG_STORE).get('spotify-playlists');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Catalog read failed.'));
  });
  db.close();
  return catalog;
}

function generatePlaylistVerifier(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => chars[value % chars.length]).join('');
}

async function createPlaylistChallenge(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function escapePlaylistHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
