import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE_ID = "nuUdpqJIinrhTtBwCJ3Q";
const MODEL_ID = "eleven_turbo_v2_5";
const GOOGLE_FALLBACK_VOICES = [
  { name: "en-GB-Neural2-D", gender: "MALE" },
  { name: "en-GB-Neural2-B", gender: "MALE" },
  { name: "en-GB-Wavenet-D", gender: "MALE" },
  { name: "en-GB-Standard-D", gender: "MALE" },
] as const;
const EDGE_TTS_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_VOICE = "en-GB-RyanNeural";
const EDGE_TTS_GEC_VERSION = "1-143.0.3650.80";

interface TTSRequestBody {
  prompt?: string;
  voiceId?: string;
  previousText?: string;
  nextText?: string;
}

interface AudioResult {
  audioBytes: Uint8Array;
  provider: "elevenlabs" | "google" | "edge";
  fallbackReason?: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function messageFromUnknown(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function synthesizeWithElevenLabs(
  prompt: string,
  voiceId: string,
  elevenLabsApiKey: string,
  previousText?: string,
  nextText?: string,
): Promise<AudioResult> {
  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenLabsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: prompt,
        model_id: MODEL_ID,
        ...(previousText ? { previous_text: previousText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.55,
          use_speaker_boost: true,
          speed: 0.95,
        },
      }),
    },
  );

  if (!ttsRes.ok) {
    const errBody = await ttsRes.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed [${ttsRes.status}] ${errBody}`.trim());
  }

  return {
    audioBytes: new Uint8Array(await ttsRes.arrayBuffer()),
    provider: "elevenlabs",
  };
}

async function synthesizeWithGoogle(prompt: string, apiKey: string): Promise<Uint8Array> {
  let lastError = "Google TTS failed";

  for (const voice of GOOGLE_FALLBACK_VOICES) {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: prompt },
          voice: {
            languageCode: "en-GB",
            name: voice.name,
            ssmlGender: voice.gender,
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 0.95,
            pitch: -2,
          },
        }),
      },
    );

    const payload = await response.json().catch(() => null) as
      | { audioContent?: string; error?: { message?: string } }
      | null;

    if (response.ok && payload?.audioContent) {
      return base64ToBytes(payload.audioContent);
    }

    lastError = payload?.error?.message || `Google TTS failed [${response.status}]`;
  }

  throw new Error(lastError);
}

function buildEdgeSsml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return `<speak version='1.0' xml:lang='en-GB'><voice name='${EDGE_TTS_VOICE}'><prosody rate='-5%' pitch='-4%'>${escaped}</prosody></voice></speak>`;
}

async function generateSecMsGec(trustedClientToken: string): Promise<string> {
  const secondsSinceUnixEpoch = Math.floor(Date.now() / 1000);
  const secondsSinceWindowsEpoch = secondsSinceUnixEpoch + 11644473600;
  const roundedSeconds = secondsSinceWindowsEpoch - (secondsSinceWindowsEpoch % 300);
  const windowsTicks = roundedSeconds * 10_000_000;
  const data = new TextEncoder().encode(`${windowsTicks}${trustedClientToken}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function getEdgeTtsEndpoint(): { endpoint: string; trustedClientToken: string } {
  return {
    endpoint: "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1",
    trustedClientToken: EDGE_TTS_TOKEN,
  };
}

async function synthesizeWithEdge(prompt: string): Promise<Uint8Array> {
  const { endpoint, trustedClientToken } = getEdgeTtsEndpoint();
  const secMsGec = await generateSecMsGec(trustedClientToken);
  const url = new URL(endpoint);
  url.searchParams.set("TrustedClientToken", trustedClientToken);
  url.searchParams.set("Sec-MS-GEC", secMsGec);
  url.searchParams.set("Sec-MS-GEC-Version", EDGE_TTS_GEC_VERSION);
  url.searchParams.set("ConnectionId", crypto.randomUUID().replace(/-/g, ""));

  const ws = new WebSocket(url.toString());
  ws.binaryType = "arraybuffer";

  const audioChunks: Uint8Array[] = [];
  let totalLength = 0;

  return await new Promise<Uint8Array>((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      reject(new Error("Edge TTS timed out"));
    }, 15000);

    const finish = () => {
      clearTimeout(timeout);
      if (!totalLength) {
        reject(new Error("Edge TTS returned no audio"));
        return;
      }
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(merged);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS websocket error"));
    };

    ws.onopen = () => {
      const requestId = crypto.randomUUID().replace(/-/g, "");
      const timestamp = new Date().toISOString();
      ws.send(`X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } })}`);
      ws.send(`X-RequestId:${requestId}\r\nX-Timestamp:${timestamp}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${buildEdgeSsml(prompt)}`);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          try { ws.close(); } catch { /* noop */ }
          finish();
        }
        return;
      }

      const data = new Uint8Array(event.data as ArrayBuffer);
      const marker = new TextEncoder().encode("Path:audio\r\n");
      let audioStart = -1;
      for (let i = 0; i <= data.length - marker.length; i++) {
        let found = true;
        for (let j = 0; j < marker.length; j++) {
          if (data[i + j] !== marker[j]) {
            found = false;
            break;
          }
        }
        if (found) {
          audioStart = i + marker.length;
          break;
        }
      }
      if (audioStart < 0 || audioStart >= data.length) return;
      const chunk = data.slice(audioStart);
      audioChunks.push(chunk);
      totalLength += chunk.length;
    };
  });
}

async function synthesizeWithFallback(
  prompt: string,
  voiceId: string,
  elevenLabsApiKey: string,
  previousText?: string,
  nextText?: string,
): Promise<AudioResult> {
  try {
    return await synthesizeWithElevenLabs(prompt, voiceId, elevenLabsApiKey, previousText, nextText);
  } catch (err) {
    const fallbackReason = messageFromUnknown(err).slice(0, 500);
    console.warn("Primary cloned voice failed; using server fallback TTS:", fallbackReason);

    try {
      const audioBytes = await synthesizeWithEdge(prompt);
      return { audioBytes, provider: "edge", fallbackReason };
    } catch (edgeErr) {
      console.warn("Edge fallback TTS failed:", messageFromUnknown(edgeErr));
    }

    const googleApiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!googleApiKey) throw err;

    const audioBytes = await synthesizeWithGoogle(prompt, googleApiKey);
    return { audioBytes, provider: "google", fallbackReason };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const elevenLabsApiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!elevenLabsApiKey) {
    return new Response(
      JSON.stringify({ error: "ELEVENLABS_API_KEY is not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: TTSRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "`prompt` is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (prompt.length > 3000) {
    return new Response(
      JSON.stringify({ error: "`prompt` must be 3000 characters or fewer" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const voiceId = body.voiceId?.trim() || DEFAULT_VOICE_ID;
  const previousText = body.previousText?.slice(0, 800);
  const nextText = body.nextText?.slice(0, 800);

  try {
    const audio = await synthesizeWithFallback(
      prompt,
      voiceId,
      elevenLabsApiKey,
      previousText,
      nextText,
    );

    if (req.headers.get("accept")?.includes("audio/mpeg")) {
      return new Response(audio.audioBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-TTS-Provider": audio.provider,
          ...(audio.fallbackReason ? { "X-TTS-Fallback": "google" } : {}),
        },
      });
    }

    const base64 = base64Encode(audio.audioBytes);

    return new Response(
      JSON.stringify({
        audioUrl: `data:audio/mpeg;base64,${base64}`,
        contentType: "audio/mpeg",
        provider: audio.provider,
        fallbackReason: audio.fallbackReason ?? null,
        requestId: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = messageFromUnknown(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
