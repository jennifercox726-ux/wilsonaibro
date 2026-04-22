// Wilson TTS — prefer a local browser male English voice, then fall back to a natural neural male voice.

import { supabase } from "@/integrations/supabase/client";
import { edgeTTSSynthesize } from "@/lib/edgeTTS";
import { attachAudio, detachAudio } from "@/lib/audioBus";

const FREE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edge-tts`;
const ELEVEN_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const GOOGLE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-tts`;
const AMERICAN_MALE_VOICE_HINTS = [
  "male",
  "daniel",
  "alex",
  "aaron",
  "william",
  "thomas",
  "james",
  "liam",
  "nathan",
  "fred",
  "ralph",
  "reed",
  "guy",
  "ryan",
  "sean",
  "lee",
  "neil",
  "duncan",
  "oliver",
  "davis",
  "jason",
  "tom",
  "matthew",
  "steve",
  "arthur",
];
const FEMALE_VOICE_HINTS = [
  "female",
  "samantha",
  "victoria",
  "allison",
  "ava",
  "zoe",
  "karen",
  "susan",
  "kathy",
  "princess",
];

function getVoiceSignature(voice: SpeechSynthesisVoice): string {
  return `${voice.name} ${voice.voiceURI}`.toLowerCase();
}

function isFemaleCodedVoice(voice: SpeechSynthesisVoice): boolean {
  const signature = getVoiceSignature(voice);
  return FEMALE_VOICE_HINTS.some((hint) => signature.includes(hint));
}

function isRecognizedAmericanMaleVoice(voice: SpeechSynthesisVoice): boolean {
  const signature = getVoiceSignature(voice);
  const lang = (voice.lang || "").toLowerCase();

  if (!(lang.startsWith("en-us") || lang.startsWith("en"))) return false;
  if (isFemaleCodedVoice(voice)) return false;

  return AMERICAN_MALE_VOICE_HINTS.some((hint) => signature.includes(hint));
}

async function fetchFreeTTS(text: string): Promise<Blob | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const resp = await fetch(FREE_TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      console.warn("[Wilson TTS] free-tts non-OK:", resp.status);
      return null;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await resp.json().catch(() => null);
      console.warn("[Wilson TTS] free-tts returned JSON:", body);
      return null;
    }
    const blob = await resp.blob();
    if (blob.size < 200) {
      console.warn("[Wilson TTS] free-tts blob too small:", blob.size);
      return null;
    }
    return blob;
  } catch (err) {
    console.warn("[Wilson TTS] free-tts request failed:", err);
    return null;
  }
}

async function fetchEdgeFunctionTTS(url: string, label: string, text: string): Promise<Blob | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      console.warn(`[Wilson TTS] ${label} non-OK:`, resp.status);
      return null;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await resp.json().catch(() => null);
      console.warn(`[Wilson TTS] ${label} returned JSON (fallback signal):`, body);
      return null;
    }
    const blob = await resp.blob();
    if (blob.size < 200) {
      console.warn(`[Wilson TTS] ${label} blob too small:`, blob.size);
      return null;
    }
    return blob;
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} request failed:`, err);
    return null;
  }
}

async function fetchPreferredMaleTTS(text: string): Promise<Blob | null> {
  try {
    const blob = await edgeTTSSynthesize(text);
    if (blob.size < 200) {
      console.warn("[Wilson TTS] edge male blob too small:", blob.size);
      return null;
    }
    console.log("[Wilson TTS] Using natural neural male fallback voice");
    return blob;
  } catch (err) {
    console.warn("[Wilson TTS] natural neural male fallback voice failed:", err);
    return null;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let playbackAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;
let htmlAudioUnlocked = false;
let playbackSessionId = 0;

const SILENT_AUDIO_DATA_URL = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YSADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

function getPlaybackAudio(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;

  if (!playbackAudio) {
    playbackAudio = new Audio();
    playbackAudio.preload = "auto";
    playbackAudio.setAttribute("playsinline", "true");
  }

  return playbackAudio;
}

function getSpeechSynthesisInstance(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

async function getAvailableVoices(timeoutMs = 1200): Promise<SpeechSynthesisVoice[]> {
  const synth = getSpeechSynthesisInstance();
  if (!synth) return [];

  const immediateVoices = synth.getVoices();
  if (immediateVoices.length > 0) {
    return immediateVoices;
  }

  return await new Promise((resolve) => {
    const handleVoicesChanged = () => {
      cleanup();
      resolve(synth.getVoices());
    };

    const cleanup = () => {
      if (typeof synth.removeEventListener === "function") {
        synth.removeEventListener("voiceschanged", handleVoicesChanged);
      }
      if (timeoutId !== null && typeof window !== "undefined") {
        window.clearTimeout(timeoutId);
      }
    };

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", handleVoicesChanged, { once: true });
    }

    const timeoutId = typeof window !== "undefined"
      ? window.setTimeout(() => {
          cleanup();
          resolve(synth.getVoices());
        }, timeoutMs)
      : null;
  });
}

function scoreAmericanMaleVoice(voice: SpeechSynthesisVoice): number {
  const name = getVoiceSignature(voice);
  const lang = (voice.lang || "").toLowerCase();

  let score = 0;

  if (lang.startsWith("en-au")) score += 170;
  else if (lang.startsWith("en-gb")) score += 150;
  else if (lang.startsWith("en-us")) score += 130;
  else if (lang.startsWith("en")) score += 80;

  if (voice.localService) score += 120;
  if (name.includes("google us english")) score += 70;
  if (name.includes("australia") || name.includes("australian")) score += 90;
  if (name.includes("united kingdom") || name.includes("british")) score += 50;
  if (name.includes("english (united states)")) score += 40;
  if (name.includes("neural") || name.includes("natural")) score += 20;
  if (isRecognizedAmericanMaleVoice(voice)) score += 240;
  if (isFemaleCodedVoice(voice)) score -= 400;

  return score;
}

function selectPreferredAmericanMaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // Prefer non-female English voices, ranked. If none qualify strictly,
  // fall back to the best non-female voice rather than going silent.
  const nonFemale = voices.filter((v) => !isFemaleCodedVoice(v));
  const pool = nonFemale.length > 0 ? nonFemale : voices;

  const ranked = [...pool].sort(
    (a, b) => scoreAmericanMaleVoice(b) - scoreAmericanMaleVoice(a)
  );

  const strict = ranked.find(isRecognizedAmericanMaleVoice);
  if (strict) return strict;

  // Always return SOMETHING playable so the user actually hears Wilson.
  return ranked[0] ?? voices[0] ?? null;
}

async function speakWithBrowserMaleVoice(text: string): Promise<boolean> {
  const synth = getSpeechSynthesisInstance();
  if (!synth) return false;

  const voice = selectPreferredAmericanMaleVoice(await getAvailableVoices());
  if (!voice) {
    console.warn("[Wilson TTS] No natural male English browser voice available");
    return false;
  }

  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang || "en-US";
    utterance.rate = 1.02;
    utterance.pitch = 0.9;
    utterance.volume = 1;

    utterance.onend = () => {
      if (currentUtterance === utterance) {
        currentUtterance = null;
      }
      resolve();
    };

    utterance.onerror = (event) => {
      if (currentUtterance === utterance) {
        currentUtterance = null;
      }
      reject(new Error(event.error || "browser speech failed"));
    };

    try {
      synth.cancel();
      synth.speak(utterance);
    } catch (error) {
      currentUtterance = null;
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  console.log("[Wilson TTS] Played via browser male voice:", voice.name, voice.lang);
  return true;
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
    // Strip Wilson's internal control tags first so TTS never reads them
    .replace(/\[VIBE:\s*\w+\]/gi, "")
    .replace(/\[DREAM_UPDATE:\s*[^\]]+\]/gi, "")
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
    audio.onended = () => {
      detachAudio(audio);
      finalizePlayback(audio, audioUrl, sessionId);
    };
    audio.onerror = () => {
      detachAudio(audio);
      finalizePlayback(audio, audioUrl, sessionId);
    };
  };

  const primaryPlayback = async () => {
    if (!primaryAudio) throw new Error("HTML audio playback is not available");

    // Don't fully reset — that would call .load() and lose our primed gesture.
    primaryAudio.onended = null;
    primaryAudio.onerror = null;
    primaryAudio.loop = false;
    primaryAudio.muted = false;
    primaryAudio.volume = 1;
    primaryAudio.src = audioUrl;
    currentAudio = primaryAudio;
    bindPlaybackLifecycle(primaryAudio);

    const playPromise = primaryAudio.play();
    if (playPromise && typeof playPromise.then === "function") {
      await playPromise;
    }
    attachAudio(primaryAudio);
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
  fallbackAudio.crossOrigin = "anonymous";
  fallbackAudio.setAttribute("playsinline", "true");
  bindPlaybackLifecycle(fallbackAudio);

  currentAudio = fallbackAudio;
  try {
    await fallbackAudio.play();
    attachAudio(fallbackAudio);
  } catch (fallbackError) {
    finalizePlayback(fallbackAudio, audioUrl, sessionId);
    throw fallbackError;
  }
}

function unlockHtmlAudio(): void {
  const audio = getPlaybackAudio();
  if (!audio) return;

  // Prime synchronously inside the user gesture. Keep the silent track
  // looping at near-zero volume so the element stays "playing" — when real
  // audio arrives we just swap the src and the browser does NOT treat that
  // as a new autoplay attempt. This is what beats iframe autoplay policies.
  try {
    audio.src = SILENT_AUDIO_DATA_URL;
    audio.loop = true;
    audio.volume = 0.001;
    audio.muted = false;
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        htmlAudioUnlocked = true;
        console.log("[Wilson TTS] HTML audio primed (silent loop)");
      }).catch((err) => {
        console.warn("[Wilson TTS] HTML audio prime failed:", err);
      });
    } else {
      htmlAudioUnlocked = true;
    }
  } catch (err) {
    console.warn("[Wilson TTS] HTML audio prime threw:", err);
  }

  // Also resume any suspended AudioContext on the same gesture.
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      const probe = new Ctor();
      if (probe.state === "suspended") probe.resume().catch(() => {});
      // Close shortly so we don't leak — audioBus owns the real one.
      setTimeout(() => probe.close().catch(() => {}), 50);
    }
  } catch {
    /* noop */
  }
}

export function unlockTTS(): void {
  unlockHtmlAudio();
  getSpeechSynthesisInstance()?.getVoices();
}

export function speakTextSync(_text: string): boolean {
  const synth = getSpeechSynthesisInstance();
  if (!synth) return false;

  const voice = selectPreferredAmericanMaleVoice(synth.getVoices());
  if (!voice) {
    console.warn("[Wilson TTS] No synchronous male American browser voice available");
    return false;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(_text).slice(0, 5000));
    currentUtterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang || "en-US";
    utterance.rate = 1.02;
    utterance.pitch = 0.9;
    utterance.volume = 1;
    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };
    utterance.onerror = () => {
      if (currentUtterance === utterance) currentUtterance = null;
    };

    synth.cancel();
    synth.speak(utterance);
    console.log("[Wilson TTS] Played via synchronous browser male voice:", voice.name, voice.lang);
    return true;
  } catch (error) {
    currentUtterance = null;
    console.warn("[Wilson TTS] Synchronous browser male voice failed:", error);
    return false;
  }
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean) {
    console.warn("[Wilson TTS] No clean text to speak");
    return;
  }

  const trimmed = clean.slice(0, 5000);

  // 1. ElevenLabs disabled by user request — skip entirely.


  // 2. Google WaveNet (deep British male)
  const googleBlob = await fetchEdgeFunctionTTS(GOOGLE_TTS_URL, "google-tts", trimmed);
  if (googleBlob) {
    try {
      await playAudioBlob(googleBlob);
      console.log("[Wilson TTS] Played via Google WaveNet");
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Google playback failed:", err);
    }
  }

  // 3. Free Google Translate TTS proxy (server-side mp3, works in iframes)
  const freeBlob = await fetchFreeTTS(trimmed);
  if (freeBlob) {
    try {
      await playAudioBlob(freeBlob);
      console.log("[Wilson TTS] Played via free server TTS");
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Free TTS playback failed:", err);
    }
  }

  // 4. Microsoft Edge Neural (browser WebSocket — blocked in some iframes)
  const neuralBlob = await fetchPreferredMaleTTS(trimmed);
  if (neuralBlob) {
    try {
      await playAudioBlob(neuralBlob);
      console.log("[Wilson TTS] Played via Edge neural male");
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Edge neural playback failed:", err);
    }
  }

  // 5. Local browser voice — last resort
  try {
    const ok = await speakWithBrowserMaleVoice(trimmed);
    if (ok) return;
  } catch (error) {
    console.warn("[Wilson TTS] Browser voice failed:", error);
  }

  throw new Error("Wilson can't reach any voice provider right now.");
}

export function stopSpeaking(): void {
  getSpeechSynthesisInstance()?.cancel();
  currentUtterance = null;
  playbackSessionId += 1;
  const activeAudio = currentAudio;
  if (activeAudio && activeAudio !== playbackAudio) {
    resetAudioElement(activeAudio);
  }
  resetAudioElement(getPlaybackAudio());
  detachAudio();
  currentAudio = null;
  revokeCurrentAudioUrl();
}

export function isSpeaking(): boolean {
  const audio = currentAudio ?? playbackAudio;
  const browserSpeaking = !!getSpeechSynthesisInstance()?.speaking;
  return browserSpeaking || !!(audio && !audio.paused && !audio.ended);
}
