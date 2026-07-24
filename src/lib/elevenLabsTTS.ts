// Updated comments and logic to remove Lovable references. Primary is now ElevenLabs again.

interface ElevenLabsConfig {
  voiceId: string;
  apiKey: string;
}

let config: ElevenLabsConfig | null = null;
let currentAudio: HTMLAudioElement | null = null;
let subscribers: Array<() => void> = [];

export function setElevenLabsConfig(apiKey: string, voiceId: string = "JBFqnCBsd6RMkjVY5Cd5") {
  config = { apiKey, voiceId };
}

export function primeElevenLabsPlayback(): void {
  // Priming: create a silent audio context to allow autoplay on iOS/Safari
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // Ignore errors - we just tried to resume
      });
    }
  } catch {
    // AudioContext not available
  }
}

export async function speakWithElevenLabs(text: string): Promise<"success" | "blocked" | "error"> {
  if (!config) {
    console.warn("ElevenLabs not configured");
    return "error";
  }

  try {
    stopElevenLabs();

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": config.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      console.error("ElevenLabs API error:", response.status);
      return "error";
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    currentAudio = new Audio(audioUrl);

    currentAudio.onended = () => {
      currentAudio = null;
      notifySubscribers();
    };

    currentAudio.onerror = () => {
      currentAudio = null;
      notifySubscribers();
    };

    try {
      await currentAudio.play();
      notifySubscribers();
      return "success";
    } catch (e) {
      // Play failed - likely blocked by browser autoplay policy
      if ((e as Error).name === "NotAllowedError") {
        return "blocked";
      }
      console.error("Audio play error:", e);
      return "error";
    }
  } catch (error) {
    console.error("Error in speakWithElevenLabs:", error);
    return "error";
  }
}

export function stopElevenLabs(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  notifySubscribers();
}

export function isElevenLabsSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

export function subscribeToElevenLabs(callback: () => void): () => void {
  subscribers.push(callback);
  return () => {
    subscribers = subscribers.filter((cb) => cb !== callback);
  };
}

function notifySubscribers(): void {
  subscribers.forEach((cb) => cb());
}
