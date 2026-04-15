// Wilson TTS — natural voices only: ElevenLabs → Edge TTS → silent

import { edgeTTSSynthesize } from "./edgeTTS";

const ELEVENLABS_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const EDGE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edge-tts`;

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let playbackAudio: HTMLAudioElement | null = null;
let htmlAudioUnlocked = false;
let playbackSessionId = 0;

const TTS_RETRY_COOLDOWN_MS = 3_000;
const PREMIUM_TTS_MAX_CHARS = 500;
const SILENT_AUDIO_DATA_URL = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

const providerState = {
  elevenLabsRetryAt: 0,
  edgeTtsRetryAt: 0,
};

type CloudTTSResult = "played" | "provider-unavailable" | "playback-failed";

function getPlaybackAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  if (!playbackAudio) {
    playbackAudio = new Audio();
    playbackAudio.preload = "auto";
    playbackAudio.setAttribute("playsinline", "true");
  }

  return playbackAudio;
}

function revokeCurrentAudioUrl(): void {
  if (!currentAudioUrl) return;
  URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}

function revokeAudioUrl(audioUrl: string | null): void {
  if (!audioUrl) return;
  URL.revokeObjectURL(audioUrl);
  if (currentAudioUrl === audioUrl) {
    currentAudioUrl = null;
  }
}

function resetAudioElement(audio: HTMLAudioElement | null): void {
  if (!audio) return;
  audio.onended = null;
  audio.onerror = null;
  audio.pause();
  audio.currentTime = 0;
  audio.removeAttribute("src");
  audio.load();
}

function finalizePlayback(audio: HTMLAudioElement | null, audioUrl: string, sessionId: number): void {
  if (audio) {
    audio.onended = null;
    audio.onerror = null;
  }

  if (sessionId === playbackSessionId && currentAudio === audio) {
    currentAudio = null;
  }

  revokeAudioUrl(audioUrl);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

function limitPremiumText(text: string, maxLen = PREMIUM_TTS_MAX_CHARS): string {
  if (text.length <= maxLen) return text;

  const clipped = text.slice(0, maxLen);
  const lastSentenceBreak = Math.max(
    clipped.lastIndexOf("."),
    clipped.lastIndexOf("!"),
    clipped.lastIndexOf("?")
  );

  if (lastSentenceBreak >= Math.floor(maxLen * 0.55)) {
    return clipped.slice(0, lastSentenceBreak + 1).trim();
  }

  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace >= Math.floor(maxLen * 0.7)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }

  return `${clipped.trim()}...`;
}

async function playAudioBlob(audioBlob: Blob): Promise<void> {
  const audioUrl = URL.createObjectURL(audioBlob);
  const sessionId = ++playbackSessionId;
  revokeCurrentAudioUrl();
  currentAudioUrl = audioUrl;

  const primaryAudio = getPlaybackAudio();
  const bindPlaybackLifecycle = (audio: HTMLAudioElement) => {
    audio.onended = () => finalizePlayback(audio, audioUrl, sessionId);
    audio.onerror = () => finalizePlayback(audio, audioUrl, sessionId);
  };

  const primaryPlayback = async () => {
    if (!primaryAudio) throw new Error("HTML audio playback is not available");

    resetAudioElement(primaryAudio);
    primaryAudio.src = audioUrl;
    primaryAudio.volume = 1;
    currentAudio = primaryAudio;
    bindPlaybackLifecycle(primaryAudio);

    await primaryAudio.play();
  };

  try {
    await primaryPlayback();
    return;
  } catch (primaryError) {
    if (primaryAudio) {
      primaryAudio.onended = null;
      primaryAudio.onerror = null;
    }
    if (currentAudio === primaryAudio) {
      currentAudio = null;
    }
    console.warn("[Wilson TTS] Persistent audio playback failed, retrying with fresh Audio:", primaryError);
  }

  const fallbackAudio = new Audio(audioUrl);
  fallbackAudio.preload = "auto";
  fallbackAudio.setAttribute("playsinline", "true");
  bindPlaybackLifecycle(fallbackAudio);

  currentAudio = fallbackAudio;
  try {
    await fallbackAudio.play();
  } catch (fallbackError) {
    finalizePlayback(fallbackAudio, audioUrl, sessionId);
    throw fallbackError;
  }
}

function unlockHtmlAudio(): void {
  const audio = getPlaybackAudio();
  if (!audio || htmlAudioUnlocked) return;

  audio.src = SILENT_AUDIO_DATA_URL;
  audio.volume = 0.01;

  const playAttempt = audio.play();

  const resetUnlockedAudio = () => {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
    audio.volume = 1;
  };

  if (playAttempt && typeof playAttempt.then === "function") {
    playAttempt
      .then(() => {
        resetUnlockedAudio();
        htmlAudioUnlocked = true;
        console.log("[Wilson TTS] HTML audio unlocked via gesture");
      })
      .catch((error) => {
        htmlAudioUnlocked = false;
        console.warn("[Wilson TTS] HTML audio unlock failed:", error);
      });
    return;
  }

  resetUnlockedAudio();
  htmlAudioUnlocked = true;
}

export function unlockTTS(): void {
  unlockHtmlAudio();
}

async function tryCloudTTS(url: string, text: string, label: string): Promise<CloudTTSResult> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} request failed:`, err);
    return "provider-unavailable";
  }

  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    try {
      const json = await response.json();
      if (json?.fallback) {
        console.warn(`[Wilson TTS] ${label} unavailable, falling back`);
        return "provider-unavailable";
      }
      console.warn(`[Wilson TTS] ${label} returned JSON instead of audio:`, json);
      return "provider-unavailable";
    } catch (err) {
      console.warn(`[Wilson TTS] ${label} returned unreadable JSON:`, err);
      return "provider-unavailable";
    }
  }

  if (!response.ok) {
    console.warn(`[Wilson TTS] ${label} failed: ${response.status}`);
    return "provider-unavailable";
  }

  try {
    const audioBlob = await response.blob();
    if (!audioBlob.type.includes("audio") && audioBlob.size < 100) {
      console.warn(`[Wilson TTS] Invalid audio from ${label}`);
      return "provider-unavailable";
    }

    await playAudioBlob(audioBlob);
    console.log(`[Wilson TTS] Playing via ${label}`);
    return "played";
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} playback failed:`, err);
    return "playback-failed";
  }
}

function shouldTryProvider(retryAt: number): boolean {
  return Date.now() >= retryAt;
}

function markProviderFailure(label: "ElevenLabs" | "Edge TTS"): void {
  const retryAt = Date.now() + TTS_RETRY_COOLDOWN_MS;

  if (label === "ElevenLabs") {
    providerState.elevenLabsRetryAt = retryAt;
  } else {
    providerState.edgeTtsRetryAt = retryAt;
  }
}

function markProviderSuccess(label: "ElevenLabs" | "Edge TTS"): void {
  if (label === "ElevenLabs") {
    providerState.elevenLabsRetryAt = 0;
  } else {
    providerState.edgeTtsRetryAt = 0;
  }
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean) {
    console.warn("[Wilson TTS] No clean text to speak");
    return;
  }
  const premiumText = limitPremiumText(clean);
  let playbackFailed = false;

  // Tier 1: ElevenLabs (premium, always try first)
  if (!playbackFailed && shouldTryProvider(providerState.elevenLabsRetryAt)) {
    console.log("[Wilson TTS] Trying ElevenLabs...");
    const result = await tryCloudTTS(ELEVENLABS_TTS_URL, premiumText, "ElevenLabs");
    if (result === "played") {
      markProviderSuccess("ElevenLabs");
      return;
    }

    if (result === "playback-failed") {
      markProviderSuccess("ElevenLabs");
      playbackFailed = true;
    } else {
      markProviderFailure("ElevenLabs");
    }
  }

  // Tier 2: Client-side Edge TTS WebSocket (browser connects directly to Bing)
  if (!playbackFailed) {
    try {
      console.log("[Wilson TTS] Trying Edge TTS client WebSocket...");
      const audioBlob = await edgeTTSSynthesize(clean.slice(0, 5000));
      if (audioBlob && audioBlob.size > 100) {
        await playAudioBlob(audioBlob);
        console.log("[Wilson TTS] Playing via Edge TTS client (RyanNeural)");
        return;
      }
    } catch (err) {
      console.warn("[Wilson TTS] Edge TTS client error:", err);
    }
  }

  // Tier 3: Web Speech API with premium system voices (FREE, no credits)
  if (!playbackFailed && typeof window !== "undefined" && window.speechSynthesis) {
    try {
      console.log("[Wilson TTS] Trying Web Speech API with premium voice...");
      await speakWithWebSpeechAPI(clean);
      console.log("[Wilson TTS] Playing via Web Speech API");
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Web Speech API failed:", err);
    }
  }

  console.warn("[Wilson TTS] All voice providers unavailable; staying silent to preserve Wilson's identity");
}

// --- Web Speech API: hunt for premium/natural system voices ---

let cachedPremiumVoice: SpeechSynthesisVoice | null = null;

function getPremiumVoice(): SpeechSynthesisVoice | null {
  if (cachedPremiumVoice) return cachedPremiumVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Priority order: look for the best natural-sounding English voices
  const preferencePatterns = [
    /Google US English/i,
    /Google UK English Male/i,
    /Microsoft Ryan/i,
    /Microsoft Guy/i,
    /Microsoft Mark/i,
    /Daniel/i,
    /Aaron/i,
    /Natural/i,
    /Premium/i,
    /Enhanced/i,
  ];

  for (const pattern of preferencePatterns) {
    const match = voices.find(v => pattern.test(v.name) && v.lang.startsWith("en"));
    if (match) {
      cachedPremiumVoice = match;
      console.log(`[Wilson TTS] Selected premium voice: ${match.name}`);
      return match;
    }
  }

  // Fallback: any English voice
  const anyEnglish = voices.find(v => v.lang.startsWith("en"));
  if (anyEnglish) {
    cachedPremiumVoice = anyEnglish;
    console.log(`[Wilson TTS] Using English fallback voice: ${anyEnglish.name}`);
    return anyEnglish;
  }

  return null;
}

function speakWithWebSpeechAPI(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const synth = window.speechSynthesis;
    synth.cancel(); // clear queue

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
    const voice = getPremiumVoice();
    if (voice) utterance.voice = voice;

    utterance.pitch = 1.0;
    utterance.rate = 0.92;
    utterance.volume = 1.0;

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);

    // Chrome bug: voices may not be loaded yet
    if (!voice && synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        const v = getPremiumVoice();
        if (v) utterance.voice = v;
        synth.speak(utterance);
      };
    } else {
      synth.speak(utterance);
    }

    // Safety timeout
    setTimeout(() => {
      if (synth.speaking) {
        // Still speaking, that's fine - let it finish
      } else {
        reject(new Error("Web Speech API did not start"));
      }
    }, 2000);
  });
}

export function stopSpeaking(): void {
  playbackSessionId += 1;
  const activeAudio = currentAudio;
  if (activeAudio && activeAudio !== playbackAudio) {
    resetAudioElement(activeAudio);
  }
  resetAudioElement(getPlaybackAudio());
  currentAudio = null;
  revokeCurrentAudioUrl();
  // Also stop Web Speech API
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  const audio = currentAudio ?? playbackAudio;
  const audioPlaying = !!(audio && !audio.paused && !audio.ended);
  const webSpeechPlaying = typeof window !== "undefined" && window.speechSynthesis?.speaking;
  return audioPlaying || !!webSpeechPlaying;
}

