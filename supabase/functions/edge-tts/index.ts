const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VOICE = "en-GB-RyanNeural";

function buildSSML(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-GB'>
<voice name='${VOICE}'>
<prosody rate='-2%' pitch='-1Hz'>${escaped}</prosody>
</voice>
</speak>`;
}

async function synthesize(text: string): Promise<ArrayBuffer> {
  const ssml = buildSSML(text);

  // Try multiple Azure free TTS endpoints
  const endpoints = [
    "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1",
    "https://westus.tts.speech.microsoft.com/cognitiveservices/v1",
    "https://eastus.api.speech.microsoft.com/cognitiveservices/v1",
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: ssml,
      });

      if (response.ok) {
        const buf = await response.arrayBuffer();
        if (buf.byteLength > 100) {
          console.log(`Edge TTS success via ${endpoint}`);
          return buf;
        }
      }
      // consume body before trying next
      await response.text().catch(() => {});
    } catch (e) {
      console.warn(`Endpoint ${endpoint} failed:`, e);
    }
  }

  throw new Error("All Edge TTS endpoints failed");
}

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

    const audioBuffer = await synthesize(text.slice(0, 5000));

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Edge TTS error:", error);
    return new Response(
      JSON.stringify({ error: "EDGE_TTS_FAILED", fallback: true }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
