// Wilson TTS - ElevenLabs with browser speech fallback

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

let currentAudio: HTMLAudioElement | null = null;

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

export function unlockTTS(): void {
  // No-op
}

function speakWithBrowser(text: string): void {
  if (!window.speechSynthesis) return;
  
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.0;
  utterance.pitch = 0.9;
  utterance.volume = 1.0;
  
  // Try to pick a good male voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => 
    v.name.includes("Daniel") || v.name.includes("Google UK English Male") || v.name.includes("Male")
  ) || voices.find(v => v.lang.startsWith("en")) || voices[0];
  
  if (preferred) utterance.voice = preferred;
  
  window.speechSynthesis.speak(utterance);
}

export async function speakText(text: string): Promise<void> {
  stopSpeaking();

  const clean = stripMarkdown(text);
  if (!clean) return;

  // Try ElevenLabs first
  try {
    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ text: clean }),
    });

    if (response.ok) {
      const audioBlob = await response.blob();
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
      return;
    }
  } catch (err) {
    console.warn("[Wilson TTS] ElevenLabs failed, using browser voice:", err);
  }

  // Fallback to browser speech synthesis
  console.log("[Wilson TTS] Using browser speech fallback");
  speakWithBrowser(clean.slice(0, 3000));
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
