// Wilson TTS — free only: Edge TTS (browser WebSocket → Microsoft Bing) → Web Speech fallback

import { edgeTTSSynthesize } from "./edgeTTS";

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let playbackAudio: HTMLAudioElement | null = null;
let htmlAudioUnlocked = false;
let playbackSessionId = 0;

const SILENT_AUDIO_DATA_URL = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

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

export async function speakText(text: string): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean) {
    console.warn("[Wilson TTS] No clean text to speak");
    return;
  }

  // Tier 1: Edge TTS WebSocket — en-US-GuyNeural (free, neural quality)
  try {
    console.log("[Wilson TTS] Trying Edge TTS (GuyNeural)...");
    const audioBlob = await edgeTTSSynthesize(clean.slice(0, 5000));
    if (audioBlob && audioBlob.size > 100) {
      await playAudioBlob(audioBlob);
      console.log("[Wilson TTS] Playing via Edge TTS");
      return;
    }
  } catch (err) {
    console.warn("[Wilson TTS] Edge TTS failed:", err);
  }

  // Tier 3: Web Speech API — best available system voice
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      console.log("[Wilson TTS] Falling back to Web Speech API...");
      await speakWithWebSpeechAPI(clean);
      console.log("[Wilson TTS] Playing via Web Speech API");
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Web Speech API failed:", err);
    }
  }

  console.warn("[Wilson TTS] All voice providers unavailable; staying silent");
}

// --- Web Speech API: hunt for premium/natural system voices ---

let cachedPremiumVoice: SpeechSynthesisVoice | null = null;

function getPremiumVoice(): SpeechSynthesisVoice | null {
  if (cachedPremiumVoice) return cachedPremiumVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Priority: warm, natural, trustworthy English male voices
  const preferencePatterns = [
    /Microsoft Ryan.*Natural/i,
    /Microsoft Guy.*Natural/i,
    /Microsoft Mark/i,
    /Google UK English Male/i,
    /Google US English/i,
    /Daniel/i,
    /Aaron/i,
    /James/i,
    /Arthur/i,
    /Thomas/i,
    /Ryan/i,
    /Natural/i,
    /Premium/i,
    /Enhanced/i,
    /Online/i,
  ];

  for (const pattern of preferencePatterns) {
    const match = voices.find(v => pattern.test(v.name) && v.lang.startsWith("en"));
    if (match) {
      cachedPremiumVoice = match;
      console.log(`[Wilson TTS] Selected premium voice: ${match.name}`);
      return match;
    }
  }

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
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text.slice(0, 3000));
    const voice = getPremiumVoice();
    if (voice) utterance.voice = voice;

    utterance.pitch = 0.95;
    utterance.rate = 0.88;
    utterance.volume = 1.0;
    utterance.lang = voice?.lang || "en-GB";

    let started = false;
    let timeoutId: number | null = null;

    utterance.onstart = () => {
      started = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
    utterance.onend = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      resolve();
    };
    utterance.onerror = (e) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      reject(e);
    };

    const speakNow = () => {
      synth.speak(utterance);
      timeoutId = window.setTimeout(() => {
        if (!started && !synth.speaking) {
          reject(new Error("Web Speech API did not start"));
        }
      }, 2500);
    };

    if (!voice && synth.getVoices().length === 0) {
      synth.onvoiceschanged = () => {
        const v = getPremiumVoice();
        if (v) {
          utterance.voice = v;
          utterance.lang = v.lang;
        }
        synth.onvoiceschanged = null;
        speakNow();
      };
    } else {
      speakNow();
    }
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
