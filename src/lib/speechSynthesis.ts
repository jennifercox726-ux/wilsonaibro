import { supabase } from "@/integrations/supabase/client";
import { attachAudio, detachAudio } from "@/lib/audioBus";

const FREE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/edge-tts`;

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

  if (!(lang.startsWith("en-us") || lang.startsWith("en") || lang.startsWith("en-gb") || lang.startsWith("en-au"))) {
    return false;
  }
  if (isFemaleCodedVoice(voice)) return false;

  return AMERICAN_MALE_VOICE_HINTS.some((hint) => signature.includes(hint));
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

  if (lang.startsWith("en-gb")) score += 180;
  else if (lang.startsWith("en-au")) score += 170;
  else if (lang.startsWith("en-us")) score += 150;
  else if (lang.startsWith("en")) score += 80;

  if (voice.localService) score += 120;
  if (name.includes("google us english")) score += 70;
  if (name.includes("british") || name.includes("united kingdom")) score += 100;
  if (name.includes("australia") || name.includes("australian")) score += 70;
  if (name.includes("neural") || name.includes("natural")) score += 20;
  if (isRecognizedAmericanMaleVoice(voice)) score += 240;
  if (isFemaleCodedVoice(voice)) score -= 400;

  return score;
}

function selectPreferredAmericanMaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const nonFemale = voices.filter((v) => !isFemaleCodedVoice(v));
  const pool = nonFemale.length > 0 ? nonFemale : voices;
  const ranked = [...pool].sort((a, b) => scoreAmericanMaleVoice(b) - scoreAmericanMaleVoice(a));
  const strict = ranked.find(isRecognizedAmericanMaleVoice);
  return strict ?? ranked[0] ?? voices[0] ?? null;
}

async function speakWithBrowserMaleVoice(text: string): Promise<boolean> {
  const synth = getSpeechSynthesisInstance();
  if (!synth) return false;

  const voice = selectPreferredAmericanMaleVoice(await getAvailableVoices());
  if (!voice) return false;

  return await new Promise<boolean>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang || "en-US";
    utterance.rate = 1.02;
    utterance.pitch = 0.9;
    utterance.volume = 1;

    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
      resolve(true);
    };

    utterance.onerror = () => {
      if (currentUtterance === utterance) currentUtterance = null;
      resolve(false);
    };

    try {
      synth.cancel();
      synth.speak(utterance);
    } catch {
      currentUtterance = null;
      resolve(false);
    }
  });
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
      console.warn("[Wilson TTS] edge-tts non-OK:", resp.status);
      return null;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await resp.json().catch(() => null);
      console.warn("[Wilson TTS] edge-tts returned JSON:", body);
      return null;
    }

    const blob = await resp.blob();
    if (blob.size < 200) {
      console.warn("[Wilson TTS] edge-tts blob too small:", blob.size);
      return null;
    }

    return blob;
  } catch (err) {
    console.warn("[Wilson TTS] edge-tts request failed:", err);
    return null;
  }
}

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

function revokeCurrentAudioUrl(): void {
  if (!currentAudioUrl) return;
  URL.revokeObjectURL(currentAudioUrl);
  currentAudioUrl = null;
}

function stripMarkdown(text: string): string {
  return text
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

function createPlaybackAudio(): HTMLAudioElement {
  const audio = new Audio();
  audio.preload = "auto";
  audio.crossOrigin = "anonymous";
  audio.setAttribute("playsinline", "true");
  return audio;
}

async function playSingleAudio(audio: HTMLAudioElement, audioUrl: string): Promise<void> {
  currentAudio = audio;
  currentAudioUrl = audioUrl;

  audio.onended = () => {
    detachAudio(audio);
    if (currentAudio === audio) currentAudio = null;
    revokeCurrentAudioUrl();
  };

  audio.onerror = () => {
    detachAudio(audio);
    if (currentAudio === audio) currentAudio = null;
    revokeCurrentAudioUrl();
  };

  audio.src = audioUrl;
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.then === "function") {
    await playPromise;
  }
  attachAudio(audio);
}

export function unlockTTS(): void {
  getSpeechSynthesisInstance()?.getVoices();
}

export function speakTextSync(_text: string): boolean {
  const synth = getSpeechSynthesisInstance();
  if (!synth) return false;

  const voice = selectPreferredAmericanMaleVoice(synth.getVoices());
  if (!voice) return false;

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
    return true;
  } catch {
    currentUtterance = null;
    return false;
  }
}

export async function speakText(text: string): Promise<void> {
  const clean = stripMarkdown(text);
  if (!clean) return;

  stopSpeaking();

  const trimmed = clean.slice(0, 5000);

  // Create the audio element synchronously before any await so playback stays
  // tied to the user gesture on strict browsers.
  const audio = createPlaybackAudio();

  const blob = await fetchFreeTTS(trimmed);
  if (blob) {
    const audioUrl = URL.createObjectURL(blob);
    try {
      await playSingleAudio(audio, audioUrl);
      return;
    } catch (err) {
      console.warn("[Wilson TTS] Single-provider audio playback failed:", err);
      revokeCurrentAudioUrl();
    }
  }

  const ok = await speakWithBrowserMaleVoice(trimmed);
  if (ok) return;

  throw new Error("Wilson voice playback failed.");
}

export function stopSpeaking(): void {
  getSpeechSynthesisInstance()?.cancel();
  currentUtterance = null;

  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }

  detachAudio(currentAudio ?? undefined);
  currentAudio = null;
  revokeCurrentAudioUrl();
}

export function isSpeaking(): boolean {
  const browserSpeaking = !!getSpeechSynthesisInstance()?.speaking;
  return browserSpeaking || !!(currentAudio && !currentAudio.paused && !currentAudio.ended);
}
