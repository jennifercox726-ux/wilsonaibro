// Browser-based TTS for Wilson's voice
// Uses Web Speech API with warm male voice settings

let selectedVoice: SpeechSynthesisVoice | null = null;
let voicesLoaded = false;

const PREFERRED_VOICES = [
  "Daniel",
  "Microsoft David",
  "Google UK English Male",
  "Alex",
  "Tom",
  "Microsoft Mark",
  "Microsoft Guy",
  "Aaron",
  "Google US English",
  "James",
  "Fred",
];

function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  for (const pref of PREFERRED_VOICES) {
    const match = voices.find((v) => v.name.includes(pref));
    if (match) return match;
  }

  const english = voices.filter((v) => v.lang.startsWith("en"));
  return english[0] || voices[0];
}

function ensureVoices(): Promise<void> {
  if (voicesLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) {
      selectedVoice = pickBestVoice();
      voicesLoaded = true;
      resolve();
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      selectedVoice = pickBestVoice();
      voicesLoaded = true;
      resolve();
    };
    setTimeout(() => {
      selectedVoice = pickBestVoice();
      voicesLoaded = true;
      resolve();
    }, 2000);
  });
}

// Strip markdown for cleaner speech
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[✨🐀🔥💡⚡️🎯]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

// Queue for speaking - we store text to speak and process it
let pendingSpeech: string | null = null;

// Call this inside the user's click/send handler to unlock audio context
// AND to actually trigger any pending speech
export function unlockTTS(): void {
  if (!("speechSynthesis" in window)) return;
  // Pre-load voices
  ensureVoices();
}

export async function speakText(text: string): Promise<void> {
  if (!("speechSynthesis" in window)) {
    console.warn("[Wilson TTS] speechSynthesis not available");
    return;
  }

  // Cancel anything currently playing
  speechSynthesis.cancel();

  await ensureVoices();

  const clean = stripMarkdown(text);
  if (!clean) return;

  console.log("[Wilson TTS] Speaking:", clean.substring(0, 80) + "...");
  console.log("[Wilson TTS] Selected voice:", selectedVoice?.name || "default");

  const utterance = new SpeechSynthesisUtterance(clean);
  currentUtterance = utterance;

  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.rate = 1.0;
  utterance.pitch = 0.95;
  utterance.volume = 1;

  // Chrome bug workaround: speech can pause on long text
  const resumeInterval = setInterval(() => {
    if (!speechSynthesis.speaking) {
      clearInterval(resumeInterval);
      return;
    }
    speechSynthesis.pause();
    speechSynthesis.resume();
  }, 10000);

  utterance.onend = () => {
    console.log("[Wilson TTS] Finished speaking");
    clearInterval(resumeInterval);
  };
  utterance.onerror = (e) => {
    console.error("[Wilson TTS] Error:", e.error);
    clearInterval(resumeInterval);
  };

  // Use a small delay to help with browser autoplay policies
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 100);
}

export function stopSpeaking(): void {
  if ("speechSynthesis" in window) {
    speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function isSpeaking(): boolean {
  return "speechSynthesis" in window && speechSynthesis.speaking;
}
