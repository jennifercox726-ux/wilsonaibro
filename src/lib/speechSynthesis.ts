// ElevenLabs TTS for Wilson's voice
// Uses Daniel voice - warm, friendly, natural-sounding male

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

let currentAudio: HTMLAudioElement | null = null;

// Strip markdown for cleaner speech
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove all emoji and special unicode symbols
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    // Remove any unpaired surrogates that cause ElevenLabs API errors
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export function unlockTTS(): void {
  // No-op now — ElevenLabs uses Audio element which doesn't need pre-unlock
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();

  const clean = stripMarkdown(text);
  if (!clean) return;

  console.log("[Wilson TTS] Speaking via ElevenLabs:", clean.substring(0, 80) + "...");

  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text: clean }),
    });

    if (!response.ok) {
      console.error("[Wilson TTS] Failed:", response.status);
      return;
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
      console.log("[Wilson TTS] Finished speaking");
    };
    audio.onerror = (e) => {
      console.error("[Wilson TTS] Audio error:", e);
      URL.revokeObjectURL(audioUrl);
      currentAudio = null;
    };

    await audio.play();
  } catch (err) {
    console.error("[Wilson TTS] Error:", err);
  }
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}
