const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_UNAVAILABLE", fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Payload — user's custom ElevenLabs voice
    const voiceId = "xhIKM1xfCeWaYYE84Lou";

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.35,
            similarity_boost: 0.78,
            style: 0.45,
            use_speaker_boost: true,
            speed: 0.94,
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error("ElevenLabs error:", response.status, errBody);

      // If quota exceeded, try with shorter text before giving up
      if (response.status === 401) {
        try {
          const parsed = JSON.parse(errBody);
          const remaining = parsed?.detail?.remaining ?? parsed?.detail?.status === "quota_exceeded" ? 0 : -1;
          if (remaining >= 0) {
            // Estimate max chars from remaining credits (~2 chars per credit)
            const maxChars = Math.floor(remaining * 0.4);
            if (maxChars >= 20 && text.length > maxChars) {
              // Retry with shorter text
              const shortText = text.slice(0, maxChars).replace(/[^.!?\s]*$/, "").trim() || text.slice(0, maxChars);
              console.log("ElevenLabs retrying with", shortText.length, "chars (credits:", remaining, ")");
              const retryResp = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
                {
                  method: "POST",
                  headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    text: shortText,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                      stability: 0.35,
                      similarity_boost: 0.78,
                      style: 0.45,
                      use_speaker_boost: true,
                      speed: 0.94,
                    },
                  }),
                },
              );
              if (retryResp.ok) {
                const retryBuffer = await retryResp.arrayBuffer();
                return new Response(retryBuffer, {
                  headers: {
                    ...corsHeaders,
                    "Content-Type": "audio/mpeg",
                    "Cache-Control": "no-cache",
                  },
                });
              }
              // Retry also failed — consume body and fall through
              await retryResp.text();
            }
          }
        } catch (_) {
          // JSON parse failed, fall through
        }
      }

      return new Response(
        JSON.stringify({ error: "ELEVENLABS_UNAVAILABLE", fallback: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("TTS error:", error);
    return new Response(
      JSON.stringify({ error: "ELEVENLABS_FAILED", fallback: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
