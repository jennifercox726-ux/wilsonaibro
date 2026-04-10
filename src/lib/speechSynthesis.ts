// Wilson TTS - ElevenLabs with automatic browser speech fallback

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

let currentAudio: HTMLAudioElement | null = null;
let useElevenLabs = true; // switches to false for the session on quota/failure
let ttsUnlocked = false; // tracks whether speechSynthesis has been gesture-unlocked

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

/**
 * Split text into chunks at sentence boundaries, each under maxLen chars.
 * Chrome's speechSynthesis silently fails on text longer than ~200-300 chars.
 */
function chunkText(text: string, maxLen = 180): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  // Split on sentence-ending punctuation followed by space
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

  // If we only got one chunk (no sentence breaks found), force-split
  if (chunks.length === 0) chunks.push(text.slice(0, maxLen));

  return chunks;
}

/**
 * Get the best-sounding English voice available.
 * Priority: premium/natural voices > standard voices > any English voice.
 * Chrome has "Google UK English Male", Safari has "Daniel" and "Samantha",
 * Edge has "Microsoft Guy Online" etc.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Premium natural-sounding voices (ranked by quality for a warm male tone)
  const preferredNames = [
    "Daniel",                    // Safari - excellent British male
    "Aaron",                     // Safari - natural US male  
    "Google UK English Male",    // Chrome - decent British male
    "Microsoft Guy Online",      // Edge - natural US male
    "Microsoft Ryan Online",     // Edge - natural US male
    "Google US English",         // Chrome - US male/female mix
    "Rishi",                     // Safari - good male voice
    "Tom",                       // Safari - US male
    "Alex",                      // macOS - classic but decent
  ];

  // Try each preferred voice in order
  for (const name of preferredNames) {
    const match = voices.find(
      (v) => v.name.includes(name) && v.lang.startsWith("en")
    );
    if (match) return match;
  }

  // Fallback: any English male-sounding voice, then any English voice
  return (
    voices.find((v) => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("female")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0]
  );
}

/**
 * Call this synchronously inside a user gesture handler (click/tap)
 * BEFORE any async work. This "unlocks" browser speech synthesis
 * so the fallback voice works on Chrome and Safari.
 */
export function unlockTTS(): void {
  if (!window.speechSynthesis) return;
  if (ttsUnlocked) return; // only need to unlock once per page session

  // Speak a silent utterance to unlock the engine
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0.01; // near-silent but not zero (some browsers ignore volume=0)
  silent.rate = 10; // fast so it finishes instantly

  // Pre-load voices
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
  console.log("[Wilson TTS] Browser voice selected:", voice?.name || "none found",
    "| Voices available:", window.speechSynthesis.getVoices().length,
    "| Unlocked:", ttsUnlocked);

  // Chunk text to avoid Chrome's silent-failure on long utterances
  const chunks = chunkText(text);
  console.log("[Wilson TTS] Speaking", chunks.length, "chunk(s)");

  // Queue all chunks — speechSynthesis processes them sequentially
  for (let i = 0; i < chunks.length; i++) {
    const utterance = new SpeechSynthesisUtterance(chunks[i]);
    utterance.rate = 1.05;
    utterance.pitch = 0.85;
    utterance.volume = 1.0;
    utterance.lang = "en-US";
    if (voice) utterance.voice = voice;

    // Log errors for debugging
    utterance.onerror = (e) => {
      console.error("[Wilson TTS] Utterance error on chunk", i, ":", e.error);
    };
    if (i === 0) {
      utterance.onstart = () => {
        console.log("[Wilson TTS] Speech started");
      };
    }
    if (i === chunks.length - 1) {
      utterance.onend = () => {
        console.log("[Wilson TTS] Speech finished");
      };
    }

    window.speechSynthesis.speak(utterance);
  }
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();

  const clean = stripMarkdown(text);
  if (!clean) return;

  // If ElevenLabs already failed this session, go straight to browser voice
  if (!useElevenLabs) {
    console.log("[Wilson TTS] Using browser voice (session fallback)");
    speakWithBrowser(clean.slice(0, 3000));
    return;
  }

  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text: clean }),
    });

    // Check Content-Type to distinguish audio from JSON fallback signals
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      const json = await response.json();
      if (json?.fallback) {
        console.warn("[Wilson TTS] ElevenLabs unavailable, switching to browser voice for session");
        useElevenLabs = false;
        speakWithBrowser(clean.slice(0, 3000));
        return;
      }
      throw new Error(json?.error || "Unexpected JSON from TTS");
    }

    if (!response.ok) {
      throw new Error(`TTS request failed: ${response.status}`);
    }

    const audioBlob = await response.blob();
    if (!audioBlob.type.includes("audio") && audioBlob.size < 100) {
      throw new Error("Invalid audio response");
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    };
    audio.onerror = (e) => {
      console.error("[Wilson TTS] Audio playback error:", e);
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      // Fall back to browser voice if audio playback fails
      speakWithBrowser(clean.slice(0, 3000));
    };

    await audio.play();
  } catch (err) {
    console.warn("[Wilson TTS] ElevenLabs failed, using browser voice:", err);
    useElevenLabs = false;
    speakWithBrowser(clean.slice(0, 3000));
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeaking(): boolean {
  if (currentAudio && !currentAudio.paused) return true;
  if (window.speechSynthesis?.speaking) return true;
  return false;
}
