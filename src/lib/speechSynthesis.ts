// Wilson TTS - ElevenLabs with automatic browser speech fallback

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

let currentAudio: HTMLAudioElement | null = null;
let useElevenLabs = true; // switches to false for the session on quota/failure

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

// Pre-created utterance holder — must be set in gesture context
let pendingUtterance: SpeechSynthesisUtterance | null = null;

/**
 * Call this synchronously inside a user gesture handler (click/tap)
 * BEFORE any async work. This "unlocks" browser speech synthesis
 * so the fallback voice works on Chrome and Safari.
 */
export function unlockTTS(): void {
  if (!window.speechSynthesis) return;

  // Pre-create the utterance in gesture context
  pendingUtterance = new SpeechSynthesisUtterance("");
  pendingUtterance.volume = 0;

  // Also prime the speech engine with a silent speak
  window.speechSynthesis.speak(pendingUtterance);

  // Now create the real one we'll reuse
  pendingUtterance = new SpeechSynthesisUtterance("");
  pendingUtterance.rate = 1.05;
  pendingUtterance.pitch = 0.85;
  pendingUtterance.volume = 1.0;

  // Pre-select voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.name.includes("Daniel")) ||
    voices.find((v) => v.name.includes("Google UK English Male")) ||
    voices.find((v) => v.name.includes("Male") && v.lang.startsWith("en")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (preferred) {
    pendingUtterance.voice = preferred;
  }
}

function speakWithBrowser(text: string): void {
  if (!window.speechSynthesis) {
    console.warn("[Wilson TTS] No browser speechSynthesis available");
    return;
  }

  window.speechSynthesis.cancel();

  // Use the pre-created utterance if available (gesture-unlocked)
  if (pendingUtterance) {
    const utt = pendingUtterance;
    pendingUtterance = null; // consume it
    utt.text = text;
    utt.volume = 1.0;

    // Ensure voice is set
    if (!utt.voice) {
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((v) => v.name.includes("Daniel")) ||
        voices.find((v) => v.name.includes("Google UK English Male")) ||
        voices.find((v) => v.name.includes("Male") && v.lang.startsWith("en")) ||
        voices.find((v) => v.lang.startsWith("en")) ||
        voices[0];
      if (preferred) utt.voice = preferred;
    }

    console.log("[Wilson TTS] Speaking with pre-unlocked browser voice:", utt.voice?.name || "default");
    window.speechSynthesis.speak(utt);
    return;
  }

  // Fallback: create fresh (may not work if outside gesture context)
  console.log("[Wilson TTS] No pre-unlocked utterance, trying fresh creation");
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 0.85;
  utterance.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.name.includes("Daniel")) ||
    voices.find((v) => v.name.includes("Google UK English Male")) ||
    voices.find((v) => v.name.includes("Male") && v.lang.startsWith("en")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    voices[0];
  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.speak(utterance);
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
    audio.onerror = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
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
