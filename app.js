const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const talkButton = document.getElementById('talkButton');
const supportMessage = document.getElementById('supportMessage');
const statusText = document.getElementById('statusText');
const transcriptText = document.getElementById('transcriptText');
const actionOutput = document.getElementById('actionOutput');
const debugForm = document.getElementById('debugForm');
const debugInput = document.getElementById('debugInput');

let recognition = null;
let isListening = false;
let lastAction = null;

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
    talkButton.textContent = 'Listening…';
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
    talkButton.textContent = 'Tap to Talk';
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

function handleCommand(command, source = 'voice') {
  transcriptText.textContent = command || 'Nothing heard.';
  const parsed = parseCommand(command, source);
  lastAction = parsed;
  showAction(parsed);
  statusText.textContent = parsed.needs_ai
    ? 'Local parser is unsure. AI fallback would be needed later.'
    : `Parsed locally: ${parsed.action}`;
}

function showAction(action) {
  actionOutput.textContent = JSON.stringify(action, null, 2);
}

function parseCommand(rawCommand, source = 'voice') {
  const original = rawCommand.trim();
  const command = normalize(original);

  if (!command) {
    return unknownAction(original, source, 'No command heard.');
  }

  if (matchesAny(command, ['undo', 'undo that', 'cancel that', 'forget that'])) {
    return buildAction('undo_last_action', { source, previous_action: lastAction?.action || null });
  }

  if (matchesAny(command, ['show rules', 'show my rules', 'what are the rules', 'show blocked artists'])) {
    return buildAction('show_rules', { source });
  }

  if (matchesAny(command, ['play', 'start playing', 'resume', 'resume music'])) {
    return buildAction('play', { source });
  }

  if (matchesAny(command, ['pause', 'pause music', 'stop music'])) {
    return buildAction('pause', { source });
  }

  if (matchesAny(command, ['skip', 'skip this', 'skip this song', 'next', 'next song'])) {
    return buildAction('skip_track', { source });
  }

  if (matchesAny(command, ['restart', 'restart song', 'restart this song', 'replay this song', 'start this song over'])) {
    return buildAction('restart_track', { source });
  }

  if (includesAny(command, ['play this next', 'play it next', 'queue this next'])) {
    return buildAction('play_next', { source, target: 'current_track' });
  }

  const energyMatch = command.match(/(?:set|keep|make) (?:the )?energy (?:at|to)?\s*(\d{1,2})/);
  if (energyMatch) {
    return buildAction('set_energy', {
      source,
      level: clamp(Number(energyMatch[1]), 1, 10),
      duration: 'session'
    });
  }

  const genrePreference = parseGenrePreference(command);
  if (genrePreference) {
    return buildAction('set_genre_preference', { source, ...genrePreference });
  }

  const playlistAction = parsePlaylistAction(command);
  if (playlistAction) {
    return buildAction(playlistAction.action, { source, ...playlistAction.details });
  }

  const artistRule = parseArtistRule(command, original);
  if (artistRule) {
    return buildAction(artistRule.action, { source, ...artistRule.details });
  }

  const songRule = parseSongRule(command);
  if (songRule) {
    return buildAction(songRule.action, { source, ...songRule.details });
  }

  return unknownAction(original, source, 'No confident local match.');
}

function parseArtistRule(command, original) {
  const duration = parseDuration(command);

  const blockPatterns = [
    /(?:do not|dont|never|no|block|ban|avoid) play (?<artist>.+?)(?: for | tonight| until | permanently|$)/,
    /(?:do not|dont|never|no|block|ban|avoid) (?<artist>.+?)(?: for | tonight| until | permanently|$)/,
    /(?:delete you|fired|done with you).+ if you play (?<artist>.+?)(?: again|$)/
  ];

  for (const pattern of blockPatterns) {
    const artist = extractNamedMatch(command, pattern, 'artist');
    if (artist && !artist.includes('this song')) {
      return {
        action: 'block_artist',
        details: {
          artist: cleanEntity(artist),
          duration_days: duration.days,
          duration_label: duration.label,
          expires: duration.expires
        }
      };
    }
  }

  const favorPatterns = [
    /(?:play more|more|favor|increase) (?<artist>.+?)(?: tonight| for |$)/,
    /play (?<artist>.+?) every (?<frequency>other|\d+) song(?:s)?(?: tonight|$)/,
    /if you do not play (?<artist>.+?) every (?<frequency>other|\d+) song(?:s)?(?: tonight|$)/
  ];

  for (const pattern of favorPatterns) {
    const match = command.match(pattern);
    if (match?.groups?.artist) {
      return {
        action: 'favor_artist',
        details: {
          artist: cleanEntity(match.groups.artist),
          duration_label: duration.label || (command.includes('tonight') ? 'tonight' : 'session'),
          frequency: match.groups.frequency ? normalizeFrequency(match.groups.frequency) : null,
          weight: 2
        }
      };
    }
  }

  const reducePatterns = [
    /(?:play less|less|reduce) (?<artist>.+?)(?: tonight| for |$)/
  ];

  for (const pattern of reducePatterns) {
    const artist = extractNamedMatch(command, pattern, 'artist');
    if (artist) {
      return {
        action: 'reduce_artist',
        details: {
          artist: cleanEntity(artist),
          duration_label: duration.label || (command.includes('tonight') ? 'tonight' : 'session'),
          weight: -1
        }
      };
    }
  }

  if (/delete you|fired|done with you/.test(command) && /play/.test(command)) {
    return {
      action: 'needs_ai_interpretation',
      details: {
        raw_command: original,
        reason: 'Threat or consequence phrasing involving playback is ambiguous.'
      }
    };
  }

  return null;
}

function parseSongRule(command) {
  if (includesAny(command, ['do not play this song', 'dont play this song', 'never play this song', 'block this song'])) {
    const duration = parseDuration(command);
    return {
      action: 'block_song',
      details: {
        target: 'current_track',
        duration_days: duration.days,
        duration_label: duration.label,
        expires: duration.expires
      }
    };
  }

  if (includesAny(command, ['play this song more', 'favor this song', 'more of this song'])) {
    return {
      action: 'favor_song',
      details: {
        target: 'current_track',
        duration_label: command.includes('tonight') ? 'tonight' : 'session',
        weight: 2
      }
    };
  }

  return null;
}

function parsePlaylistAction(command) {
  if (includesAny(command, ['add this song to my playlist', 'save this song', 'add this song'])) {
    return {
      action: 'add_current_song_to_playlist',
      details: { target: 'current_track' }
    };
  }

  const artistMatch = command.match(/add (?<artist>.+?) to (?:my )?playlist/);
  if (artistMatch?.groups?.artist && !artistMatch.groups.artist.includes('this song')) {
    return {
      action: 'add_artist_to_playlist',
      details: { artist: cleanEntity(artistMatch.groups.artist) }
    };
  }

  return null;
}

function parseGenrePreference(command) {
  const moreMatch = command.match(/(?:play more|more) (?<genre>[a-z0-9 '&-]+?)(?: music| songs|$)/);
  if (moreMatch?.groups?.genre) {
    return {
      genre: cleanEntity(moreMatch.groups.genre),
      preference: 'more',
      weight: 1,
      duration: command.includes('tonight') ? 'tonight' : 'session'
    };
  }

  const lessMatch = command.match(/(?:play less|less) (?<genre>[a-z0-9 '&-]+?)(?: music| songs|$)/);
  if (lessMatch?.groups?.genre) {
    return {
      genre: cleanEntity(lessMatch.groups.genre),
      preference: 'less',
      weight: -1,
      duration: command.includes('tonight') ? 'tonight' : 'session'
    };
  }

  return null;
}

function parseDuration(command) {
  if (command.includes('permanently') || command.includes('forever') || command.includes('never')) {
    return { label: 'permanent', days: null, expires: null };
  }

  if (command.includes('tonight') || command.includes('this party')) {
    return { label: command.includes('this party') ? 'this_party' : 'tonight', days: 0, expires: 'session_end' };
  }

  if (command.includes('a week') || command.includes('one week') || command.includes('seven days')) {
    return { label: '7 days', days: 7, expires: daysFromNow(7) };
  }

  if (command.includes('quarter of a month')) {
    return { label: '7 days', days: 7, expires: daysFromNow(7) };
  }

  const dayMatch = command.match(/for (\d+) day/);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    return { label: `${days} days`, days, expires: daysFromNow(days) };
  }

  const hourMatch = command.match(/for (\d+) hour/);
  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    return { label: `${hours} hours`, days: hours / 24, expires: hoursFromNow(hours) };
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

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesAny(value, options) {
  return options.some((option) => value === option);
}

function includesAny(value, options) {
  return options.some((option) => value.includes(option));
}

function extractNamedMatch(value, pattern, groupName) {
  const match = value.match(pattern);
  return match?.groups?.[groupName] || null;
}

function cleanEntity(value) {
  return value
    .replace(/\b(for|tonight|until|permanently|again|please)\b.*$/g, '')
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
