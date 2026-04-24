import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_VOICE_ID = "nuUdpqJIinrhTtBwCJ3Q";
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

  try {
    // Step 1: Validate the voice is accessible with the configured API key
    const voiceCheck = await fetch(
      `https://api.elevenlabs.io/v1/voices/${voiceId}`,
      {
        method: "GET",
        headers: { "xi-api-key": elevenLabsApiKey },
      },
    );

    if (!voiceCheck.ok) {
      const detailText = await voiceCheck.text();
      let detailJson: Record<string, unknown> | null = null;
      try {
        detailJson = JSON.parse(detailText);
      } catch {
        /* not JSON */
      }

      if (voiceCheck.status === 401 || voiceCheck.status === 403) {
        return new Response(
          JSON.stringify({
            error: "ElevenLabs API key is invalid or unauthorized",
            code: "INVALID_API_KEY",
            voiceId,
            nextActions: [
              "Verify the ELEVENLABS_API_KEY secret is correct",
              "Check the key has not been revoked at https://elevenlabs.io/app/settings/api-keys",
              "Confirm the key belongs to the account that owns the voice",
            ],
            details: detailJson ?? detailText,
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (voiceCheck.status === 404) {
        return new Response(
          JSON.stringify({
            error: `Voice "${voiceId}" was not found on this ElevenLabs account`,
            code: "VOICE_NOT_FOUND",
            voiceId,
            nextActions: [
              "Open https://elevenlabs.io/app/voice-lab and confirm the voice exists",
              "If it's a shared/public voice, click 'Add to VoiceLab' first",
              "Copy the Voice ID from the voice's ⋮ menu and update DEFAULT_VOICE_ID",
              "Make sure the API key belongs to the same account as the voice",
            ],
            details: detailJson ?? detailText,
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          error: `Voice validation failed [${voiceCheck.status}]`,
          code: "VOICE_VALIDATION_FAILED",
          voiceId,
          nextActions: [
            "Try again in a moment — ElevenLabs may be rate-limiting or temporarily unavailable",
            "Check status at https://status.elevenlabs.io",
          ],
          details: detailJson ?? detailText,
        }),
        {
          status: voiceCheck.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Step 2: Synthesize speech now that the voice is confirmed accessible
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
