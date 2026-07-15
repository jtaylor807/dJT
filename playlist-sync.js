const DJT_SPOTIFY_CLIENT_ID = '00b9c89802ff42b088a25a636c9e9d61';
const DJT_SPOTIFY_TOKEN_KEY = 'djt_spotify_access_token';
const DJT_SPOTIFY_TOKEN_EXPIRES_KEY = 'djt_spotify_token_expires_at';
const DJT_SPOTIFY_VERIFIER_KEY = 'djt_spotify_code_verifier';
const DJT_PLAYLIST_AUTH_REQUESTED_KEY = 'djt_playlist_auth_requested';
const DJT_DIAGNOSTICS_KEY = 'djt_spotify_diagnostics';
const DJT_PLAYLIST_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative'
].join(' ');
const DJT_CATALOG_DB_NAME = 'djt_catalog';
const DJT_CATALOG_DB_VERSION = 1;
const DJT_CATALOG_STORE = 'snapshots';
const DJT_APP_VERSION = '0.3.4';

const playlistAuthorizeButton = document.getElementById('playlistAuthorizeButton');
const syncSpotifyPlaylistsButton = document.getElementById('syncSpotifyPlaylistsButton');
const playlistSyncStatus = document.getElementById('playlistSyncStatus');
const playlistCatalogSummary = document.getElementById('playlistCatalogSummary');
const playlistCatalogList = document.getElementById('playlistCatalogList');
const diagnosticCurrentStep = document.getElementById('diagnosticCurrentStep');
const diagnosticStepList = document.getElementById('diagnosticStepList');
const diagnosticOutput = document.getElementById('diagnosticOutput');
const copyDiagnosticsButton = document.getElementById('copyDiagnosticsButton');
const clearDiagnosticsButton = document.getElementById('clearDiagnosticsButton');

const diagnosticSteps = [
  { id: 'page', label: 'Load current dJT files' },
  { id: 'token', label: 'Find a valid Spotify token' },
  { id: 'playlist-list', label: 'Request Spotify playlist list' },
  { id: 'playlist-items', label: 'Request tracks from each playlist' },
  { id: 'catalog-save', label: 'Save catalog locally' },
  { id: 'complete', label: 'Finish playlist sync' }
];

let diagnostics = loadDiagnostics();
renderDiagnosticSteps();
recordDiagnostic('info', 'page', 'Playlist diagnostics initialized.', {
  app_version: DJT_APP_VERSION,
  script: 'playlist-sync.js?v=0.3.4',
  page: window.location.href,
  user_agent: navigator.userAgent
});
setDiagnosticStep('page', 'passed', 'Current diagnostics script loaded.');
initializePlaylistCatalog();

playlistAuthorizeButton?.addEventListener('click', async () => {
  try {
    await authorizeSpotifyForPlaylists();
  } catch (error) {
    setPlaylistStatus(`Spotify authorization error: ${error.message}`);
    setDiagnosticStep('token', 'failed', error.message);
    recordDiagnostic('error', 'authorization', error.message, serializeError(error));
  }
});

syncSpotifyPlaylistsButton?.addEventListener('click', syncSpotifyPlaylists);
copyDiagnosticsButton?.addEventListener('click', copyDiagnostics);
clearDiagnosticsButton?.addEventListener('click', clearDiagnostics);

async function initializePlaylistCatalog() {
  try {
    const token = getPlaylistSpotifyToken();
    const expiresAt = Number(localStorage.getItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY) || 0);
    const authWasRequested = sessionStorage.getItem(DJT_PLAYLIST_AUTH_REQUESTED_KEY) === 'true';

    recordDiagnostic('info', 'startup', 'Spotify startup state checked.', {
      token_present: Boolean(token),
      token_expiration_local: expiresAt ? new Date(expiresAt).toLocaleString() : null,
      playlist_authorization_requested_this_session: authWasRequested,
      authorization_code_in_url: new URL(window.location.href).searchParams.has('code'),
      authorization_error_in_url: new URL(window.location.href).searchParams.get('error')
    });

    if (token) {
      setDiagnosticStep('token', 'passed', 'A non-expired Spotify token is stored.');
      setPlaylistStatus('Spotify token found. Tap Sync Spotify Playlists to test playlist access.');
    } else {
      setDiagnosticStep('token', 'waiting', 'No usable Spotify token is stored.');
    }

    const catalog = await loadCatalog();
    renderCatalog(catalog);
  } catch (error) {
    setPlaylistStatus(`Could not initialize playlist catalog: ${error.message}`);
    recordDiagnostic('error', 'startup', error.message, serializeError(error));
  }
}

async function authorizeSpotifyForPlaylists() {
  resetSyncDiagnosticSteps();
  const verifier = generatePlaylistVerifier(64);
  const challenge = await createPlaylistChallenge(verifier);
  sessionStorage.setItem(DJT_SPOTIFY_VERIFIER_KEY, verifier);
  sessionStorage.setItem(DJT_PLAYLIST_AUTH_REQUESTED_KEY, 'true');

  const redirectUri = getPlaylistRedirectUri();
  const params = new URLSearchParams({
    client_id: DJT_SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: DJT_PLAYLIST_SCOPES,
    show_dialog: 'true'
  });

  recordDiagnostic('info', 'authorization', 'Redirecting to Spotify authorization.', {
    redirect_uri: redirectUri,
    requested_scopes: DJT_PLAYLIST_SCOPES
  });
  setDiagnosticCurrent('Opening Spotify authorization…', 'working');
  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function syncSpotifyPlaylists() {
  resetSyncDiagnosticSteps();
  const token = getPlaylistSpotifyToken();
  const expiresAt = Number(localStorage.getItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY) || 0);

  if (!token) {
    const message = 'Your Spotify session is missing or expired. Tap Reconnect Spotify for Playlists.';
    setPlaylistStatus(message);
    setDiagnosticStep('token', 'failed', message);
    recordDiagnostic('error', 'token', message, {
      token_present: Boolean(localStorage.getItem(DJT_SPOTIFY_TOKEN_KEY)),
      expiration_value: expiresAt || null,
      now: Date.now()
    });
    return;
  }

  setDiagnosticStep('token', 'passed', `Token valid until ${new Date(expiresAt).toLocaleString()}.`);
  setSyncBusy(true);
  setPlaylistStatus('Testing Spotify playlist access…');
  setDiagnosticStep('playlist-list', 'working', 'Calling GET /v1/me/playlists.');

  try {
    const playlistRows = await fetchAllSpotifyPages(
      'https://api.spotify.com/v1/me/playlists?limit=50',
      token,
      'your playlist list',
      'playlist-list'
    );

    setDiagnosticStep('playlist-list', 'passed', `Spotify returned ${playlistRows.length} playlists.`);
    setPlaylistStatus(`Playlist access verified. Found ${playlistRows.length} playlists.`);

    const playlists = [];
    const skippedPlaylists = [];
    let importedTrackEntries = 0;
    let unavailableEntries = 0;
    const uniqueTrackIds = new Set();

    setDiagnosticStep('playlist-items', 'working', `Loading tracks from ${playlistRows.length} playlists.`);

    for (let index = 0; index < playlistRows.length; index += 1) {
      const playlist = playlistRows[index];
      const playlistName = playlist.name || 'Untitled playlist';
      setPlaylistStatus(`Loading playlist ${index + 1} of ${playlistRows.length}: ${playlistName}`);
      setDiagnosticCurrent(`Playlist ${index + 1}/${playlistRows.length}: ${playlistName}`, 'working');

      try {
        const endpoint = playlist.items?.href
          || playlist.tracks?.href
          || `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlist.id)}/items?limit=100`;
        const entries = await fetchAllSpotifyPages(endpoint, token, `playlist “${playlistName}”`, 'playlist-items');
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
          name: playlistName,
          description: playlist.description || '',
          owner: playlist.owner?.display_name || playlist.owner?.id || 'Unknown owner',
          collaborative: Boolean(playlist.collaborative),
          public: playlist.public,
          snapshot_id: playlist.snapshot_id || null,
          spotify_url: playlist.external_urls?.spotify || null,
          image_url: playlist.images?.[0]?.url || null,
          tracks
        });
      } catch (error) {
        skippedPlaylists.push({ name: playlistName, reason: error.message });
        recordDiagnostic('warning', 'playlist-items', `Skipped playlist: ${playlistName}`, {
          reason: error.message
        });
      }
    }

    setDiagnosticStep(
      'playlist-items',
      skippedPlaylists.length ? 'warning' : 'passed',
      `${playlists.length} loaded; ${skippedPlaylists.length} skipped.`
    );

    const catalog = {
      id: 'spotify-playlists',
      source: 'spotify',
      synced_at: new Date().toISOString(),
      playlist_count: playlists.length,
      spotify_playlist_count: playlistRows.length,
      skipped_playlist_count: skippedPlaylists.length,
      track_entry_count: importedTrackEntries,
      unique_track_count: uniqueTrackIds.size,
      unavailable_entry_count: unavailableEntries,
      skipped_playlists: skippedPlaylists,
      playlists
    };

    setDiagnosticStep('catalog-save', 'working', 'Writing playlist catalog to IndexedDB.');
    await saveCatalog(catalog);
    setDiagnosticStep('catalog-save', 'passed', 'Catalog saved in this browser.');
    renderCatalog(catalog);

    const skippedText = skippedPlaylists.length
      ? ` ${skippedPlaylists.length} playlist${skippedPlaylists.length === 1 ? ' was' : 's were'} skipped.`
      : '';
    const completeMessage = `Sync complete: ${catalog.playlist_count} playlists, ${catalog.track_entry_count} track entries, ${catalog.unique_track_count} unique tracks.${skippedText}`;
    setPlaylistStatus(completeMessage);
    setDiagnosticStep('complete', 'passed', completeMessage);
    recordDiagnostic('success', 'complete', completeMessage, {
      playlist_count: catalog.playlist_count,
      track_entry_count: catalog.track_entry_count,
      unique_track_count: catalog.unique_track_count,
      skipped_playlist_count: catalog.skipped_playlist_count,
      unavailable_entry_count: catalog.unavailable_entry_count
    });
  } catch (error) {
    const message = `Playlist sync error: ${error.message}`;
    setPlaylistStatus(message);
    setDiagnosticCurrent(error.message, 'failed');
    recordDiagnostic('error', 'sync', error.message, serializeError(error));
  } finally {
    setSyncBusy(false);
  }
}

async function fetchAllSpotifyPages(initialUrl, token, resourceLabel, stepId) {
  const items = [];
  let url = initialUrl;
  let page = 0;

  while (url) {
    page += 1;
    const startedAt = performance.now();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const rawBody = await response.text();
    let data = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { non_json_body: rawBody.slice(0, 1000) };
    }

    const requestDiagnostic = {
      resource: resourceLabel,
      endpoint: redactSpotifyUrl(url),
      page,
      http_status: response.status,
      status_text: response.statusText,
      elapsed_ms: Math.round(performance.now() - startedAt),
      response_headers: {
        content_type: response.headers.get('content-type'),
        retry_after: response.headers.get('retry-after'),
        spotify_request_id: response.headers.get('spotify-request-id')
      },
      response_body: sanitizeSpotifyResponse(data)
    };

    recordDiagnostic(response.ok ? 'info' : 'error', 'spotify-api', `${resourceLabel}: HTTP ${response.status}`, requestDiagnostic);

    if (response.status === 401) {
      clearPlaylistSpotifyToken();
      setDiagnosticStep(stepId, 'failed', 'HTTP 401: Spotify token expired or was rejected.');
      throw createDiagnosticError('Your Spotify session expired or Spotify rejected the token.', requestDiagnostic);
    }

    if (!response.ok) {
      const spotifyMessage = data.error?.message || data.error_description || data.message || '';
      const message = spotifyMessage
        ? `Spotify returned HTTP ${response.status} for ${resourceLabel}: ${spotifyMessage}`
        : `Spotify returned HTTP ${response.status} for ${resourceLabel}.`;
      setDiagnosticStep(stepId, 'failed', message);
      throw createDiagnosticError(message, requestDiagnostic);
    }

    if (Array.isArray(data.items)) items.push(...data.items);
    url = data.next || null;
  }

  return items;
}

function createDiagnosticError(message, diagnostic) {
  const error = new Error(message);
  error.diagnostic = diagnostic;
  return error;
}

function getPlaylistSpotifyToken() {
  const token = localStorage.getItem(DJT_SPOTIFY_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY) || 0);
  if (!token || !expiresAt || Date.now() >= expiresAt) return null;
  return token;
}

function clearPlaylistSpotifyToken() {
  localStorage.removeItem(DJT_SPOTIFY_TOKEN_KEY);
  localStorage.removeItem(DJT_SPOTIFY_TOKEN_EXPIRES_KEY);
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
  const skipped = Number(catalog.skipped_playlist_count) || 0;
  playlistCatalogSummary.textContent = `${catalog.playlist_count} playlists • ${catalog.track_entry_count} track entries • ${catalog.unique_track_count} unique tracks${skipped ? ` • ${skipped} skipped` : ''} • Synced ${synced}`;
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

function resetSyncDiagnosticSteps() {
  for (const step of diagnosticSteps) {
    if (step.id !== 'page') setDiagnosticStep(step.id, 'waiting', 'Not started.');
  }
}

function setDiagnosticStep(stepId, state, detail) {
  const element = document.querySelector(`[data-diagnostic-step="${stepId}"]`);
  if (element) {
    element.dataset.state = state;
    const stateElement = element.querySelector('.diagnostic-step-state');
    const detailElement = element.querySelector('.diagnostic-step-detail');
    if (stateElement) stateElement.textContent = diagnosticStateLabel(state);
    if (detailElement) detailElement.textContent = detail;
  }
  setDiagnosticCurrent(detail, state);
}

function setDiagnosticCurrent(message, state) {
  if (!diagnosticCurrentStep) return;
  diagnosticCurrentStep.textContent = message;
  diagnosticCurrentStep.dataset.state = state;
}

function renderDiagnosticSteps() {
  if (!diagnosticStepList) return;
  diagnosticStepList.innerHTML = diagnosticSteps.map((step) => `
    <li data-diagnostic-step="${step.id}" data-state="waiting">
      <div>
        <strong>${escapePlaylistHtml(step.label)}</strong>
        <small class="diagnostic-step-detail">Not started.</small>
      </div>
      <span class="diagnostic-step-state">Waiting</span>
    </li>
  `).join('');
  renderDiagnosticOutput();
}

function diagnosticStateLabel(state) {
  return {
    waiting: 'Waiting',
    working: 'Working',
    passed: 'Passed',
    warning: 'Warning',
    failed: 'Failed'
  }[state] || state;
}

function recordDiagnostic(level, stage, message, details = {}) {
  diagnostics.push({
    timestamp: new Date().toISOString(),
    level,
    stage,
    message,
    details
  });
  diagnostics = diagnostics.slice(-150);
  localStorage.setItem(DJT_DIAGNOSTICS_KEY, JSON.stringify(diagnostics));
  renderDiagnosticOutput();
}

function loadDiagnostics() {
  try {
    const saved = JSON.parse(localStorage.getItem(DJT_DIAGNOSTICS_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function renderDiagnosticOutput() {
  if (!diagnosticOutput) return;
  diagnosticOutput.textContent = JSON.stringify({
    generated_at: new Date().toISOString(),
    app_version: DJT_APP_VERSION,
    requested_scopes: DJT_PLAYLIST_SCOPES.split(' '),
    entries: diagnostics
  }, null, 2);
}

async function copyDiagnostics() {
  const text = diagnosticOutput?.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
    setDiagnosticCurrent('Diagnostics copied to clipboard.', 'passed');
  } catch {
    setDiagnosticCurrent('Could not copy automatically. Select the diagnostic text manually.', 'warning');
  }
}

function clearDiagnostics() {
  diagnostics = [];
  localStorage.removeItem(DJT_DIAGNOSTICS_KEY);
  renderDiagnosticOutput();
  resetSyncDiagnosticSteps();
  setDiagnosticStep('page', 'passed', 'Current diagnostics script loaded.');
  setDiagnosticCurrent('Diagnostics cleared.', 'waiting');
}

function redactSpotifyUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return String(value);
  }
}

function sanitizeSpotifyResponse(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data.items)) {
    return {
      item_count_on_page: data.items.length,
      total: data.total ?? null,
      limit: data.limit ?? null,
      offset: data.offset ?? null,
      has_next: Boolean(data.next)
    };
  }
  return data;
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    diagnostic: error?.diagnostic || null,
    stack: error?.stack || null
  };
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
