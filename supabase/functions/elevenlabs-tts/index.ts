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

interface TTSRequestBody {
  prompt?: string;
  voiceId?: string;
  previousText?: string;
  nextText?: string;
}

interface AudioResult {
  audioBytes: Uint8Array;
  provider: "elevenlabs" | "google";
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
    // Synthesize speech directly. We skip the /v1/voices pre-check because
    // many API keys are scoped to text_to_speech only and don't have voices_read.
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
      const errBody = await ttsRes.text();
      return new Response(
        JSON.stringify({
          error: `ElevenLabs TTS failed [${ttsRes.status}]`,
          details: errBody,
        }),
        {
          status: ttsRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    if (req.headers.get("accept")?.includes("audio/mpeg")) {
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    }

    const base64 = base64Encode(audioBuffer);

    return new Response(
      JSON.stringify({
        audioUrl: `data:audio/mpeg;base64,${base64}`,
        contentType: "audio/mpeg",
        provider: "elevenlabs",
        requestId: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
