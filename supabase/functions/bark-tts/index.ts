// Wilson TTS edge function — uses ElevenLabs (deep male voice) and returns
// a base64 data URL the client can play directly. Function name kept as
// "bark-tts" to avoid breaking the existing client wiring.

import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// "Brian" — deep, warm, gravelly male voice. Closest match to the
// McConaughey/Connery drawl Wilson is supposed to have.
const DEFAULT_VOICE_ID = "nPczCjzI2devNBz1zQrb";
const MODEL_ID = "eleven_turbo_v2_5";

interface TTSRequestBody {
  prompt?: string;
  voiceId?: string;
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

  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  if (!ELEVENLABS_API_KEY) {
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
    return new Response(
      JSON.stringify({ error: "`prompt` is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  if (prompt.length > 1000) {
    return new Response(
      JSON.stringify({ error: "`prompt` must be 1000 characters or fewer" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const voiceId = body.voiceId?.trim() || DEFAULT_VOICE_ID;

  // --- Try ElevenLabs first ---
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: prompt,
          model_id: MODEL_ID,
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
      const audioBuffer = await ttsRes.arrayBuffer();
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
    }

    // ElevenLabs failed — capture details and fall through to Google TTS
    const errBody = await ttsRes.text();
    const isQuota = ttsRes.status === 401 || ttsRes.status === 429 ||
      /quota|credit|exceed/i.test(errBody);
    console.warn(
      `ElevenLabs failed [${ttsRes.status}]${isQuota ? " (quota)" : ""}, falling back to Google TTS:`,
      errBody.slice(0, 200),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("ElevenLabs threw, falling back to Google TTS:", message);
  }

  // --- Google TTS fallback ---
  const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
  if (!GOOGLE_TTS_API_KEY) {
    return new Response(
      JSON.stringify({
        error:
          "ElevenLabs failed and GOOGLE_TTS_API_KEY is not configured for fallback",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const googleRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: prompt },
          // Deep British male voice — closest to Wilson's Connery/McConaughey vibe
          voice: {
            languageCode: "en-GB",
            name: "en-GB-Neural2-B",
            ssmlGender: "MALE",
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: 0.95,
            pitch: -2.0,
          },
        }),
      },
    );

    if (!googleRes.ok) {
      const errBody = await googleRes.text();
      console.error("Google TTS fallback failed", googleRes.status, errBody);
      return new Response(
        JSON.stringify({
          error: `Google TTS fallback failed [${googleRes.status}]`,
          details: errBody,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await googleRes.json() as { audioContent?: string };
    if (!data.audioContent) {
      return new Response(
        JSON.stringify({ error: "Google TTS returned no audio" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        audioUrl: `data:audio/mpeg;base64,${data.audioContent}`,
        contentType: "audio/mpeg",
        provider: "google",
        requestId: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Wilson TTS error (fallback):", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
