// Browser-based TTS for Wilson's voice
// Picks the best available female voice and tunes for warm, friendly delivery

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

  // Try preferred voices first
  for (const pref of PREFERRED_VOICES) {
    const match = voices.find((v) => v.name.includes(pref));
    if (match) return match;
  }

  // Fallback: any English female-sounding voice
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
    // Timeout fallback
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
let ttsUnlocked = false;

// Call this inside the user's click/send handler to unlock audio context
export function unlockTTS(): void {
  if (ttsUnlocked || !("speechSynthesis" in window)) return;
  ttsUnlocked = true;
  const silent = new SpeechSynthesisUtterance(" ");
  silent.volume = 0;
  speechSynthesis.cancel();
  speechSynthesis.speak(silent);
}

export async function speakText(text: string): Promise<void> {
  if (!("speechSynthesis" in window)) return;

  speechSynthesis.cancel();

  await ensureVoices();

  const clean = stripMarkdown(text);
  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  currentUtterance = utterance;

  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.rate = 1.0;
  utterance.pitch = 0.95;
  utterance.volume = 1;

  // Chrome bug: speech can pause on long text. Workaround with resume interval.
  const resumeInterval = setInterval(() => {
    if (!speechSynthesis.speaking) {
      clearInterval(resumeInterval);
      return;
    }
    speechSynthesis.pause();
    speechSynthesis.resume();
  }, 10000);

  utterance.onend = () => clearInterval(resumeInterval);
  utterance.onerror = () => clearInterval(resumeInterval);

  speechSynthesis.speak(utterance);
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
