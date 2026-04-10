// Wilson TTS — 3-tier fallback: ElevenLabs → Google Cloud TTS → Browser voice

const ELEVENLABS_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
const GOOGLE_TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-tts`;

let currentAudio: HTMLAudioElement | null = null;
let useElevenLabs = true;
let useGoogleTTS = true;
let ttsUnlocked = false;

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

function chunkText(text: string, maxLen = 180): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0) chunks.push(text.slice(0, maxLen));
  return chunks;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const preferredNames = [
    "Daniel", "Aaron", "Google UK English Male", "Microsoft Guy Online",
    "Microsoft Ryan Online", "Google US English", "Rishi", "Tom", "Alex",
  ];
  for (const name of preferredNames) {
    const match = voices.find((v) => v.name.includes(name) && v.lang.startsWith("en"));
    if (match) return match;
  }
  return (
    voices.find((v) => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("female")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0]
  );
}

export function unlockTTS(): void {
  if (!window.speechSynthesis) return;
  if (ttsUnlocked) return;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0.01;
  silent.rate = 10;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.speak(silent);
  ttsUnlocked = true;
  console.log("[Wilson TTS] Speech engine unlocked via gesture");
}

function speakWithBrowser(text: string): void {
  if (!window.speechSynthesis) {
    console.warn("[Wilson TTS] No browser speechSynthesis available");
    return;
  }
  window.speechSynthesis.cancel();
  const voice = pickVoice();
  console.log("[Wilson TTS] Browser voice:", voice?.name || "none");
  const trimmed = text.length > 800 ? text.slice(0, 800).replace(/[^.!?]*$/, "") + "..." : text;
  const chunks = chunkText(trimmed);
  for (let i = 0; i < chunks.length; i++) {
    const utterance = new SpeechSynthesisUtterance(chunks[i]);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;
    utterance.lang = "en-GB";
    if (voice) utterance.voice = voice;
    utterance.onerror = (e) => console.error("[Wilson TTS] Chunk", i, "error:", e.error);
    window.speechSynthesis.speak(utterance);
  }
}

/** Try to play audio from a TTS endpoint. Returns true on success. */
async function tryCloudTTS(url: string, text: string, label: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text }),
    });

    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      const json = await response.json();
      if (json?.fallback) {
        console.warn(`[Wilson TTS] ${label} unavailable, falling back`);
        return false;
      }
      throw new Error(json?.error || `Unexpected JSON from ${label}`);
    }

    if (!response.ok) throw new Error(`${label} failed: ${response.status}`);

    const audioBlob = await response.blob();
    if (!audioBlob.type.includes("audio") && audioBlob.size < 100) {
      throw new Error(`Invalid audio from ${label}`);
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; };
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; };

    await audio.play();
    console.log(`[Wilson TTS] Playing via ${label}`);
    return true;
  } catch (err) {
    console.warn(`[Wilson TTS] ${label} failed:`, err);
    return false;
  }
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();
  const clean = stripMarkdown(text);
  if (!clean) return;

  // Tier 1: ElevenLabs (premium)
  if (useElevenLabs) {
    const ok = await tryCloudTTS(ELEVENLABS_TTS_URL, clean, "ElevenLabs");
    if (ok) return;
    useElevenLabs = false; // skip for rest of session
  }

  // Tier 2: Google Cloud TTS (free tier, natural WaveNet voice)
  if (useGoogleTTS) {
    const ok = await tryCloudTTS(GOOGLE_TTS_URL, clean, "Google TTS");
    if (ok) return;
    useGoogleTTS = false; // skip for rest of session
  }

  // Tier 3: Browser voice (last resort)
  console.log("[Wilson TTS] Using browser voice (last resort)");
  speakWithBrowser(clean.slice(0, 3000));
}

export function stopSpeaking(): void {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  if (currentAudio && !currentAudio.paused) return true;
  if (window.speechSynthesis?.speaking) return true;
  return false;
}
