import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CACHE_BUCKET = "tts-cache";
const CACHE_SIGNED_URL_TTL = 60 * 60 * 24 * 365; // 1 year

const supabaseAdmin = (() => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
})();

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getCachedAudioUrl(cacheKey: string): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const path = `${cacheKey}.mp3`;
    const { data, error } = await supabaseAdmin.storage
      .from(CACHE_BUCKET)
      .createSignedUrl(path, CACHE_SIGNED_URL_TTL);
    if (error || !data?.signedUrl) return null;
    // Verify the object actually exists (createSignedUrl can succeed for missing files in some cases)
    const head = await fetch(data.signedUrl, { method: "HEAD" });
    if (!head.ok) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

async function putCachedAudio(cacheKey: string, bytes: Uint8Array): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const path = `${cacheKey}.mp3`;
    const { error } = await supabaseAdmin.storage
      .from(CACHE_BUCKET)
      .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
    if (error) {
      console.warn("TTS cache upload failed:", error.message);
      return null;
    }
    const { data } = await supabaseAdmin.storage
      .from(CACHE_BUCKET)
      .createSignedUrl(path, CACHE_SIGNED_URL_TTL);
    return data?.signedUrl ?? null;
  } catch (err) {
    console.warn("TTS cache upload threw:", err instanceof Error ? err.message : err);
    return null;
  }
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE_ID = "ZFJFHgy1XbVhPAFkHsip";
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
  simulateNoCredits?: boolean;
}

interface AudioResult {
  audioBytes: Uint8Array;
  provider: "elevenlabs" | "google" | "edge" | "translate";
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

// Cap concurrent ElevenLabs calls below the account's 4-concurrent ceiling.
const MAX_CONCURRENT_ELEVENLABS = 3;
let elevenLabsInFlight = 0;
const elevenLabsQueue: Array<() => void> = [];

async function acquireElevenLabsSlot(): Promise<void> {
  if (elevenLabsInFlight < MAX_CONCURRENT_ELEVENLABS) {
    elevenLabsInFlight++;
    return;
  }
  await new Promise<void>((resolve) => elevenLabsQueue.push(resolve));
  elevenLabsInFlight++;
}

function releaseElevenLabsSlot(): void {
  elevenLabsInFlight--;
  const next = elevenLabsQueue.shift();
  if (next) next();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function synthesizeWithElevenLabs(
  prompt: string,
  voiceId: string,
  elevenLabsApiKey: string,
  previousText?: string,
  nextText?: string,
): Promise<AudioResult> {
  await acquireElevenLabsSlot();
  try {
    const maxAttempts = 5;
    let lastErr = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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

      if (ttsRes.ok) {
        return {
          audioBytes: new Uint8Array(await ttsRes.arrayBuffer()),
          provider: "elevenlabs",
        };
      }

      const errBody = await ttsRes.text().catch(() => "");
      lastErr = `ElevenLabs TTS failed [${ttsRes.status}] ${errBody}`.trim();

      // Retry on 429 (concurrent / rate limit) and 5xx transient errors
      const retriable =
        ttsRes.status === 429 ||
        (ttsRes.status >= 500 && ttsRes.status < 600);
      if (!retriable || attempt === maxAttempts) {
        throw new Error(lastErr);
      }
      // Exponential backoff with jitter: 400ms, 800ms, 1600ms, 3200ms
      const delay = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      console.warn(`ElevenLabs ${ttsRes.status}, retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(delay);
    }
    throw new Error(lastErr || "ElevenLabs TTS failed");
  } finally {
    releaseElevenLabsSlot();
  }
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

async function synthesizeWithGoogleTranslate(prompt: string): Promise<Uint8Array> {
  const parts = prompt.match(/.{1,180}(?:\s|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [prompt];
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (const part of parts) {
    const url = new URL("https://translate.google.com/translate_tts");
    url.searchParams.set("ie", "UTF-8");
    url.searchParams.set("tl", "en-GB");
    url.searchParams.set("client", "tw-ob");
    url.searchParams.set("q", part);

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
        "Referer": "https://translate.google.com/",
      },
    });

    if (!response.ok) {
      throw new Error(`Translate TTS failed [${response.status}]`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error("Translate TTS returned no audio");
    chunks.push(bytes);
    totalLength += bytes.length;
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
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

// --- OpenAI TTS via Vercel AI Gateway (no ElevenLabs spend) ----------------
const LOVABLE_TTS_VOICE = "ash"; // grounded, natural adult male
const LOVABLE_TTS_INSTRUCTIONS =
  "Speak like a friendly, upbeat, and trustworthy professional man in his 30s. Warm, confident, and energetic with a genuine smile in your voice. Natural conversational pacing, clear articulation, and an approachable, can-do attitude. Sound like a real person who is happy to help, never robotic or monotone.";
const LOVABLE_TTS_SPEED = 1.08;

async function synthesizeWithLovableAI(prompt: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("AI_GATEWAY_API_KEY");
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY missing");

  const res = await fetch("https://ai-gateway.vercel.sh/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: prompt,
      voice: LOVABLE_TTS_VOICE,
      instructions: LOVABLE_TTS_INSTRUCTIONS,
      response_format: "mp3",
      speed: LOVABLE_TTS_SPEED,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Lovable AI TTS failed [${res.status}] ${detail}`.trim());
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length) throw new Error("Lovable AI TTS returned no audio");
  return bytes;
}

async function synthesizeWithFallback(
  prompt: string,
  _voiceId: string,
  _elevenLabsApiKey: string,
  _previousText?: string,
  _nextText?: string,
  simulateNoCredits = false,
): Promise<AudioResult> {
  // Primary: OpenAI TTS via Lovable AI Gateway — free, reliable Wilson voice.
  try {
    if (simulateNoCredits) throw new Error("[simulated] no credits");
    const audioBytes = await synthesizeWithLovableAI(prompt);
    return { audioBytes, provider: "elevenlabs" }; // tag as primary so caching kicks in
  } catch (err) {
    const fallbackReason = messageFromUnknown(err).slice(0, 500);
    console.warn("Lovable AI TTS failed, trying free fallbacks:", fallbackReason);

    try {
      const audioBytes = await synthesizeWithEdge(prompt);
      return { audioBytes, provider: "edge", fallbackReason };
    } catch (edgeErr) {
      console.warn("Edge fallback TTS failed:", messageFromUnknown(edgeErr));
    }

    const googleApiKey = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (googleApiKey) {
      try {
        const audioBytes = await synthesizeWithGoogle(prompt, googleApiKey);
        return { audioBytes, provider: "google", fallbackReason };
      } catch (googleErr) {
        console.warn("Google fallback TTS failed:", messageFromUnknown(googleErr));
      }
    }

    const audioBytes = await synthesizeWithGoogleTranslate(prompt);
    return { audioBytes, provider: "translate", fallbackReason };
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

  // ElevenLabs is no longer required — Wilson voice now runs on Lovable AI (free).
  const elevenLabsApiKey =
    Deno.env.get("ELEVENLABS_MANUAL_API_KEY") ?? Deno.env.get("ELEVENLABS_API_KEY") ?? "";

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
  const simulateNoCredits =
    body.simulateNoCredits === true ||
    req.headers.get("x-tts-simulate-no-credits") === "1";

  // Cache key based on the inputs that actually affect output
  const cacheKey = await sha256Hex(
    JSON.stringify({ v: 3, voiceId, model: MODEL_ID, prompt, previousText, nextText, ttsVoice: LOVABLE_TTS_VOICE, ttsSpeed: LOVABLE_TTS_SPEED, ttsInstr: LOVABLE_TTS_INSTRUCTIONS }),
  );
  const wantsBinary = req.headers.get("accept")?.includes("audio/mpeg");

  // 1) Cache hit — return immediately, no provider call, no quota burn
  if (!simulateNoCredits && !wantsBinary) {
    const cachedUrl = await getCachedAudioUrl(cacheKey);
    if (cachedUrl) {
      return new Response(
        JSON.stringify({
          audioUrl: cachedUrl,
          contentType: "audio/mpeg",
          provider: "cache",
          fallbackReason: null,
          requestId: null,
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "X-TTS-Cache": "hit",
          },
        },
      );
    }
  }

  try {
    const audio = await synthesizeWithFallback(
      prompt,
      voiceId,
      elevenLabsApiKey,
      previousText,
      nextText,
      simulateNoCredits,
    );

    // 2) Persist to cache so next identical request is free
    let cachedUrl: string | null = null;
    if (audio.provider === "elevenlabs") {
      cachedUrl = await putCachedAudio(cacheKey, audio.audioBytes);
    }

    if (wantsBinary) {
      return new Response(audio.audioBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-TTS-Provider": audio.provider,
          ...(audio.fallbackReason ? { "X-TTS-Fallback": audio.provider } : {}),
        },
      });
    }

    const audioUrl = cachedUrl ?? `data:audio/mpeg;base64,${base64Encode(audio.audioBytes)}`;

    return new Response(
      JSON.stringify({
        audioUrl,
        contentType: "audio/mpeg",
        provider: audio.provider,
        fallbackReason: audio.fallbackReason ?? null,
        requestId: null,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-TTS-Cache": "miss",
        },
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
