const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const AI_REVIEW_QUEUE_KEY = 'djt_ai_review_queue';
const SPOTIFY_CLIENT_ID_KEY = 'djt_spotify_client_id';
const SPOTIFY_CODE_VERIFIER_KEY = 'djt_spotify_code_verifier';
const SPOTIFY_ACCESS_TOKEN_KEY = 'djt_spotify_access_token';
const SPOTIFY_TOKEN_EXPIRES_AT_KEY = 'djt_spotify_token_expires_at';
const SPOTIFY_SCOPES = 'user-read-playback-state user-modify-playback-state';

const talkButton = document.getElementById('talkButton');
const supportMessage = document.getElementById('supportMessage');
const statusText = document.getElementById('statusText');
const transcriptText = document.getElementById('transcriptText');
const actionOutput = document.getElementById('actionOutput');
const debugForm = document.getElementById('debugForm');
const debugInput = document.getElementById('debugInput');
const reviewQueue = document.getElementById('reviewQueue');
const clearReviewQueue = document.getElementById('clearReviewQueue');
const spotifyLoginButton = document.getElementById('spotifyLoginButton');
const playSavingGraceButton = document.getElementById('playSavingGraceButton');
const spotifyClientIdInput = document.getElementById('spotifyClientIdInput');
const spotifyStatusText = document.getElementById('spotifyStatusText');

let recognition = null;
let isListening = false;
let lastAction = null;

renderReviewQueue();
initializeSpotifyUi();
completeSpotifyLoginIfNeeded();

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.continuous = false;

  supportMessage.textContent = 'Voice recognition is available in this browser.';
  talkButton.disabled = false;

  recognition.addEventListener('start', () => {
    isListening = true;
    talkButton.classList.add('listening');
    talkButton.innerHTML = '<span class="mic-symbol">🎙</span><span>Listening…</span>';
    statusText.textContent = 'Listening for a DJ command.';
  });

  recognition.addEventListener('result', (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(' ')
      .trim();

    handleCommand(transcript);
  });

  recognition.addEventListener('error', (event) => {
    showAction({
      action: 'voice_error',
      confidence: 'none',
      source: 'voice',
      error: event.error,
      needs_ai: false
    });
    statusText.textContent = `Voice error: ${event.error}`;
  });

  recognition.addEventListener('end', () => {
    isListening = false;
    talkButton.classList.remove('listening');
    talkButton.innerHTML = '<span class="mic-symbol">🎙</span><span>Tap to Talk</span>';
    if (statusText.textContent === 'Listening for a DJ command.') {
      statusText.textContent = 'Idle';
    }
  });
} else {
  supportMessage.textContent = 'Voice recognition is not available in this browser. Use the debug fallback for now.';
  talkButton.disabled = true;
}

talkButton.addEventListener('click', () => {
  if (!recognition || isListening) {
    return;
  }

  recognition.start();
});

debugForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const command = debugInput.value.trim();
  if (!command) {
    return;
  }
  handleCommand(command, 'debug');
});

clearReviewQueue.addEventListener('click', () => {
  localStorage.removeItem(AI_REVIEW_QUEUE_KEY);
  renderReviewQueue();
});

spotifyClientIdInput.addEventListener('input', () => {
  const clientId = spotifyClientIdInput.value.trim();
  if (clientId) {
    localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, clientId);
    setSpotifyStatus('Spotify Client ID saved. Tap Connect Spotify when ready.');
  } else {
    localStorage.removeItem(SPOTIFY_CLIENT_ID_KEY);
    setSpotifyStatus('Spotify is not connected. Paste a Client ID first.');
  }
});

spotifyLoginButton.addEventListener('click', async () => {
  try {
    await beginSpotifyLogin();
  } catch (error) {
    setSpotifyStatus(`Spotify login error: ${error.message}`);
  }
});

playSavingGraceButton.addEventListener('click', async () => {
  try {
    await playSavingGrace();
  } catch (error) {
    setSpotifyStatus(`Spotify playback error: ${error.message}`);
  }
});

function handleCommand(command, source = 'voice') {
  transcriptText.textContent = command || 'Nothing heard.';
  const parsed = parseCommand(command, source);
  lastAction = parsed;

  if (parsed.needs_ai) {
    saveForAiReview(command, source, parsed.reason || 'No confident local match.');
  }

  showAction(parsed);
  renderReviewQueue();
  statusText.textContent = parsed.needs_ai
    ? 'Saved to AI Review Queue for future rule development.'
    : `Parsed locally: ${parsed.action}`;
}

function showAction(action) {
  actionOutput.textContent = JSON.stringify(action, null, 2);
}

function initializeSpotifyUi() {
  spotifyClientIdInput.value = localStorage.getItem(SPOTIFY_CLIENT_ID_KEY) || '';
  if (getStoredSpotifyToken()) {
    setSpotifyStatus('Spotify is connected. Open Spotify on a device, start any song, then tap Play Saving Grace.');
  } else if (spotifyClientIdInput.value) {
    setSpotifyStatus('Spotify Client ID saved. Tap Connect Spotify.');
  } else {
    setSpotifyStatus('Spotify is not connected. Paste a Spotify app Client ID first.');
  }
}

async function beginSpotifyLogin() {
  const clientId = getSpotifyClientId();
  const redirectUri = getRedirectUri();
  const verifier = generateRandomString(64);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(SPOTIFY_CODE_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function completeSpotifyLoginIfNeeded() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    setSpotifyStatus(`Spotify authorization failed: ${error}`);
    removeSpotifyQueryParams();
    return;
  }

  if (!code) {
    return;
  }

  try {
    const clientId = getSpotifyClientId();
    const verifier = sessionStorage.getItem(SPOTIFY_CODE_VERIFIER_KEY);
    if (!verifier) {
      throw new Error('Missing Spotify login verifier. Try Connect Spotify again.');
    }

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: verifier
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Could not exchange Spotify code.');
    }

    storeSpotifyToken(data.access_token, data.expires_in);
    sessionStorage.removeItem(SPOTIFY_CODE_VERIFIER_KEY);
    removeSpotifyQueryParams();
    setSpotifyStatus('Spotify connected. Open Spotify on a device, start any song, then tap Play Saving Grace.');
  } catch (error) {
    setSpotifyStatus(`Spotify connection error: ${error.message}`);
  }
}

async function playSavingGrace() {
  const token = await requireSpotifyToken();
  setSpotifyStatus('Searching Spotify for Saving Grace by Tom Petty…');

  const track = await searchSpotifyTrack(token, 'track:"Saving Grace" artist:"Tom Petty"');
  if (!track) {
    throw new Error('Could not find Saving Grace by Tom Petty.');
  }

  setSpotifyStatus(`Found ${track.name} by ${track.artists.map((artist) => artist.name).join(', ')}. Starting playback…`);

  const playResponse = await fetch('https://api.spotify.com/v1/me/player/play', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ uris: [track.uri] })
  });

  if (playResponse.status === 204) {
    setSpotifyStatus('Playing Saving Grace by Tom Petty.');
    showAction({
      action: 'spotify_play_track',
      confidence: 'high',
      needs_ai: false,
      track: track.name,
      artist: track.artists.map((artist) => artist.name).join(', '),
      uri: track.uri
    });
    return;
  }

  const errorText = await playResponse.text();
  if (playResponse.status === 404) {
    throw new Error('No active Spotify device found. Open Spotify on your iPad/iPhone or computer, start any song, then try again.');
  }

  throw new Error(errorText || `Spotify returned HTTP ${playResponse.status}.`);
}

async function searchSpotifyTrack(token, query) {
  const params = new URLSearchParams({ q: query, type: 'track', limit: '5' });
  const response = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Spotify search failed.');
  }

  const tracks = data.tracks?.items || [];
  return tracks.find((track) =>
    normalize(track.name) === 'saving grace'
    && track.artists.some((artist) => normalize(artist.name).includes('tom petty'))
  ) || tracks[0] || null;
}

async function requireSpotifyToken() {
  const token = getStoredSpotifyToken();
  if (token) {
    return token;
  }

  throw new Error('Spotify is not connected. Paste your Spotify Client ID and tap Connect Spotify first.');
}

function getSpotifyClientId() {
  const clientId = localStorage.getItem(SPOTIFY_CLIENT_ID_KEY) || spotifyClientIdInput.value.trim();
  if (!clientId) {
    throw new Error('Missing Spotify Client ID. Create a Spotify app and paste its Client ID here.');
  }
  localStorage.setItem(SPOTIFY_CLIENT_ID_KEY, clientId);
  return clientId;
}

function getRedirectUri() {
  return `${window.location.origin}${window.location.pathname}`;
}

function storeSpotifyToken(accessToken, expiresInSeconds) {
  localStorage.setItem(SPOTIFY_ACCESS_TOKEN_KEY, accessToken);
  const expiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
  localStorage.setItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
}

function getStoredSpotifyToken() {
  const token = localStorage.getItem(SPOTIFY_ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY) || 0);

  if (!token || !expiresAt || Date.now() >= expiresAt) {
    localStorage.removeItem(SPOTIFY_ACCESS_TOKEN_KEY);
    localStorage.removeItem(SPOTIFY_TOKEN_EXPIRES_AT_KEY);
    return null;
  }

  return token;
}

function removeSpotifyQueryParams() {
  const cleanUrl = `${window.location.origin}${window.location.pathname}${window.location.hash || ''}`;
  window.history.replaceState({}, document.title, cleanUrl);
}

function setSpotifyStatus(message) {
  spotifyStatusText.textContent = message;
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  return Array.from(randomValues, (value) => chars[value % chars.length]).join('');
}

async function sha256Base64Url(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function parseCommand(rawCommand, source = 'voice') {
  const original = rawCommand.trim();
  const command = normalize(original);

  if (!command) {
    return unknownAction(original, source, 'No command heard.');
  }

  const correction = parseCorrection(command, source);
  if (correction) return correction;

  const playback = parsePlayback(command, source);
  if (playback) return playback;

  const energy = parseEnergy(command, source);
  if (energy) return energy;

  const playlistAction = parsePlaylistAction(command, source);
  if (playlistAction) return playlistAction;

  const genreRule = parseGenreRule(command, source);
  if (genreRule) return genreRule;

  const songRule = parseSongRule(command, source);
  if (songRule) return songRule;

  const artistRule = parseArtistRule(command, original, source);
  if (artistRule) return artistRule;

  return unknownAction(original, source, 'No confident local match.');
}

function parseCorrection(command, source) {
  if (matchesAny(command, [
    'undo',
    'undo that',
    'cancel that',
    'forget that',
    'never mind',
    'nevermind',
    'scratch that',
    'take that back'
  ])) {
    return buildAction('undo_last_action', { source, previous_action: lastAction?.action || null });
  }

  if (matchesAny(command, [
    'show rules',
    'show my rules',
    'what are the rules',
    'show blocked artists',
    'show blocked songs',
    'show blocked genres',
    'what did i block',
    'what have i blocked'
  ])) {
    return buildAction('show_rules', { source });
  }

  return null;
}

function parsePlayback(command, source) {
  if (matchesAny(command, [
    'play',
    'start playing',
    'resume',
    'resume music',
    'keep playing',
    'unpause',
    'continue',
    'continue playing'
  ])) {
    return buildAction('play', { source });
  }

  if (matchesAny(command, [
    'pause',
    'pause music',
    'stop music',
    'hold up',
    'wait',
    'stop for a second'
  ])) {
    return buildAction('pause', { source });
  }

  if (matchesAny(command, [
    'skip',
    'skip this',
    'skip this song',
    'next',
    'next song',
    'go next',
    'move on',
    'not this one',
    'i do not want this song',
    'dont want this song'
  ])) {
    return buildAction('skip_track', { source });
  }

  if (matchesAny(command, [
    'restart',
    'restart song',
    'restart this song',
    'replay this song',
    'start this song over',
    'play this song from the beginning',
    'play this from the beginning',
    'start this song from the beginning',
    'start this over',
    'play it from the top',
    'from the beginning',
    'begin this song again',
    'run it back',
    'take it from the top'
  ])) {
    return buildAction('restart_track', { source });
  }

  if (includesAny(command, [
    'play this next',
    'play it next',
    'queue this next',
    'put this next',
    'make this next'
  ])) {
    return buildAction('play_next', { source, target: 'current_track' });
  }

  return null;
}

function parseEnergy(command, source) {
  const energyMatch = command.match(/(?:set|keep|make) (?:the )?energy (?:at|to)?\s*(\d{1,2})/);
  if (energyMatch) {
    return buildAction('set_energy', {
      source,
      level: clamp(Number(energyMatch[1]), 1, 10),
      duration: 'session'
    });
  }

  return null;
}

function parsePlaylistAction(command, source) {
  if (includesAny(command, [
    'add this song to my playlist',
    'save this song',
    'add this song',
    'favorite this song',
    'like this song',
    'put this song in my playlist'
  ])) {
    return buildAction('add_current_song_to_playlist', { source, target: 'current_track' });
  }

  const artistMatch = command.match(/add (?<artist>.+?) to (?:my )?playlist/);
  if (artistMatch?.groups?.artist && !artistMatch.groups.artist.includes('this song')) {
    return buildAction('add_artist_to_playlist', {
      source,
      artist: cleanEntity(artistMatch.groups.artist)
    });
  }

  return null;
}

function parseGenreRule(command, source) {
  const duration = parseDuration(command);
  const negativeGenre = command.match(/(?:do not|dont|don't|no|never|stop|avoid|block|ban|enough|done with|switch away from|lose) (?:play |playing |any more |more )?(?<genre>[a-z0-9 '&-]+?)(?: music| songs| tonight| for |$)/);

  if (negativeGenre?.groups?.genre && isLikelyGenre(negativeGenre.groups.genre)) {
    return buildAction('block_genre', {
      source,
      genre: cleanEntity(negativeGenre.groups.genre),
      duration_days: duration.days,
      duration_label: duration.label,
      expires: duration.expires
    });
  }

  const noMoreGenre = command.match(/(?:no more|dont play any more|don't play any more|do not play any more|stop playing|enough) (?<genre>[a-z0-9 '&-]+?)(?: music| songs| tonight|$)/);
  if (noMoreGenre?.groups?.genre) {
    return buildAction('block_genre', {
      source,
      genre: cleanEntity(noMoreGenre.groups.genre),
      duration_days: duration.days,
      duration_label: duration.label,
      expires: duration.expires
    });
  }

  const moreMatch = command.match(/(?:play more|more|give me more) (?<genre>[a-z0-9 '&-]+?)(?: music| songs| tonight| for |$)/);
  if (moreMatch?.groups?.genre && isLikelyGenre(moreMatch.groups.genre)) {
    return buildAction('set_genre_preference', {
      source,
      genre: cleanEntity(moreMatch.groups.genre),
      preference: 'more',
      weight: 1,
      duration_label: duration.label
    });
  }

  const lessMatch = command.match(/(?:play less|less|dial back|cut back on) (?<genre>[a-z0-9 '&-]+?)(?: music| songs| tonight| for |$)/);
  if (lessMatch?.groups?.genre && isLikelyGenre(lessMatch.groups.genre)) {
    return buildAction('set_genre_preference', {
      source,
      genre: cleanEntity(lessMatch.groups.genre),
      preference: 'less',
      weight: -1,
      duration_label: duration.label
    });
  }

  return null;
}

function parseSongRule(command, source) {
  if (includesAny(command, [
    'do not play this song',
    'dont play this song',
    "don't play this song",
    'never play this song',
    'block this song',
    'ban this song',
    'avoid this song',
    'no more of this song'
  ])) {
    const duration = parseDuration(command);
    return buildAction('block_song', {
      source,
      target: 'current_track',
      duration_days: duration.days,
      duration_label: duration.label,
      expires: duration.expires
    });
  }

  if (includesAny(command, [
    'play this song more',
    'favor this song',
    'more of this song',
    'keep this song around',
    'play this one more often'
  ])) {
    return buildAction('favor_song', {
      source,
      target: 'current_track',
      duration_label: command.includes('tonight') ? 'tonight' : 'session',
      weight: 2
    });
  }

  return null;
}

function parseArtistRule(command, original, source) {
  const duration = parseDuration(command);

  const playForDurationMatch = command.match(/^play (?<artist>.+?) for (?:the )?next (?<amount>\d+|one|two|three|four|five|six|seven|eight|nine|ten) (?<unit>hour|hours|day|days)$/);
  if (playForDurationMatch?.groups?.artist) {
    const parsedDuration = parseDuration(`for ${wordToNumber(playForDurationMatch.groups.amount)} ${playForDurationMatch.groups.unit}`);
    return buildAction('favor_artist', {
      source,
      artist: cleanEntity(playForDurationMatch.groups.artist),
      duration_days: parsedDuration.days,
      duration_label: parsedDuration.label,
      expires: parsedDuration.expires,
      weight: 2
    });
  }

  const blockPatterns = [
    /(?:do not|dont|don't|never|no|block|ban|avoid) play (?<artist>.+?)(?: for | tonight| until | permanently|$)/,
    /(?:do not|dont|don't|never|no|block|ban|avoid) (?<artist>.+?)(?: for | tonight| until | permanently|$)/,
    /(?:delete you|fired|done with you).+ if you play (?<artist>.+?)(?: again|$)/
  ];

  for (const pattern of blockPatterns) {
    const artist = extractNamedMatch(command, pattern, 'artist');
    if (artist && !artist.includes('this song') && !isLikelyGenre(artist)) {
      return buildAction('block_artist', {
        source,
        artist: cleanEntity(artist),
        duration_days: duration.days,
        duration_label: duration.label,
        expires: duration.expires
      });
    }
  }

  const favorPatterns = [
    /(?:play more|more|favor|increase|give me more) (?<artist>.+?)(?: tonight| for |$)/,
    /play (?<artist>.+?) every (?<frequency>other|\d+) song(?:s)?(?: tonight|$)/,
    /if you do not play (?<artist>.+?) every (?<frequency>other|\d+) song(?:s)?(?: tonight|$)/
  ];

  for (const pattern of favorPatterns) {
    const match = command.match(pattern);
    if (match?.groups?.artist && !isLikelyGenre(match.groups.artist)) {
      return buildAction('favor_artist', {
        source,
        artist: cleanEntity(match.groups.artist),
        duration_label: duration.label || (command.includes('tonight') ? 'tonight' : 'session'),
        frequency: match.groups.frequency ? normalizeFrequency(match.groups.frequency) : null,
        weight: 2
      });
    }
  }

  const reducePatterns = [
    /(?:play less|less|reduce|dial back|cut back on) (?<artist>.+?)(?: tonight| for |$)/
  ];

  for (const pattern of reducePatterns) {
    const artist = extractNamedMatch(command, pattern, 'artist');
    if (artist && !isLikelyGenre(artist)) {
      return buildAction('reduce_artist', {
        source,
        artist: cleanEntity(artist),
        duration_label: duration.label || (command.includes('tonight') ? 'tonight' : 'session'),
        weight: -1
      });
    }
  }

  if (/delete you|fired|done with you/.test(command) && /play/.test(command)) {
    return buildAction('needs_ai_interpretation', {
      source,
      raw_command: original,
      reason: 'Threat or consequence phrasing involving playback is ambiguous.'
    });
  }

  return null;
}

function parseDuration(command) {
  if (command.includes('permanently') || command.includes('forever')) {
    return { label: 'permanent', days: null, expires: null };
  }

  if (command.includes('tonight') || command.includes('this party')) {
    return { label: command.includes('this party') ? 'this_party' : 'tonight', days: 0, expires: 'session_end' };
  }

  if (command.includes('a week') || command.includes('one week') || command.includes('seven days') || command.includes('next seven days') || command.includes('the next seven days')) {
    return { label: '7 days', days: 7, expires: daysFromNow(7) };
  }

  if (command.includes('quarter of a month')) {
    return { label: '7 days', days: 7, expires: daysFromNow(7) };
  }

  const nextDayMatch = command.match(/(?:for )?(?:the )?next (\d+) day/);
  if (nextDayMatch) {
    const days = Number(nextDayMatch[1]);
    return { label: `${days} days`, days, expires: daysFromNow(days) };
  }

  const dayMatch = command.match(/for (\d+) day/);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    return { label: `${days} days`, days, expires: daysFromNow(days) };
  }

  const nextHourMatch = command.match(/(?:for )?(?:the )?next (\d+) hour/);
  if (nextHourMatch) {
    const hours = Number(nextHourMatch[1]);
    return { label: `${hours} hour${hours === 1 ? '' : 's'}`, days: hours / 24, expires: hoursFromNow(hours) };
  }

  const hourMatch = command.match(/for (\d+) hour/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    return { label: `${hours} hour${hours === 1 ? '' : 's'}`, days: hours / 24, expires: hoursFromNow(hours) };
  }

  return { label: 'session', days: 0, expires: 'session_end' };
}

function buildAction(action, details = {}) {
  return {
    action,
    confidence: action === 'needs_ai_interpretation' ? 'low' : 'high',
    needs_ai: action === 'needs_ai_interpretation',
    ...details
  };
}

function unknownAction(rawCommand, source, reason) {
  return {
    action: 'needs_ai_interpretation',
    confidence: 'low',
    source,
    raw_command: rawCommand,
    reason,
    needs_ai: true
  };
}

function saveForAiReview(command, source, reason) {
  if (!command.trim()) return;

  const queue = getReviewQueue();
  queue.unshift({
    phrase: command.trim(),
    source,
    reason,
    captured_at: new Date().toISOString()
  });

  localStorage.setItem(AI_REVIEW_QUEUE_KEY, JSON.stringify(queue.slice(0, 25)));
}

function getReviewQueue() {
  try {
    return JSON.parse(localStorage.getItem(AI_REVIEW_QUEUE_KEY)) || [];
  } catch {
    return [];
  }
}

function renderReviewQueue() {
  const queue = getReviewQueue();

  if (!queue.length) {
    reviewQueue.textContent = 'No AI-needed phrases captured yet.';
    return;
  }

  reviewQueue.innerHTML = queue
    .map((item) => `
      <div class="review-item">
        <strong>${escapeHtml(item.phrase)}</strong>
        <div class="review-meta">${escapeHtml(item.reason)} • ${escapeHtml(item.source)} • ${new Date(item.captured_at).toLocaleString()}</div>
      </div>
    `)
    .join('');
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(value, options) {
  return options.some((option) => value === normalize(option));
}

function includesAny(value, options) {
  return options.some((option) => value.includes(normalize(option)));
}

function extractNamedMatch(value, pattern, groupName) {
  const match = value.match(pattern);
  return match?.groups?.[groupName] || null;
}

function cleanEntity(value) {
  return value
    .replace(/\b(for|the next|next|tonight|until|permanently|again|please)\b.*$/g, '')
    .replace(/\bby\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeFrequency(value) {
  if (value === 'other') {
    return 'every_other_song';
  }
  return `every_${value}_songs`;
}

function isLikelyGenre(value) {
  const genre = normalize(value);
  return [
    'country',
    'pop',
    'rock',
    'rap',
    'hip hop',
    'hip-hop',
    'r&b',
    'rb',
    'dance',
    'edm',
    'metal',
    'jazz',
    'blues',
    'folk',
    'latin',
    'classical',
    'oldies',
    'disco',
    'punk',
    'reggae',
    'christmas',
    'holiday'
  ].includes(genre);
}

function wordToNumber(value) {
  const numbers = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10
  };

  return numbers[value] || Number(value);
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function hoursFromNow(hours) {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
