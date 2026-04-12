const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VOICE = "en-US-AndrewNeural";

function buildSSML(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
<voice name='${VOICE}'>
<prosody rate='+10%' pitch='+2Hz'>${escaped}</prosody>
</voice>
</speak>`;
}

async function getToken(): Promise<string> {
  const res = await fetch(
    "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0",
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) {
    // Fallback: try the Edge Read Aloud token endpoint
    const res2 = await fetch(
      "https://edge.microsoft.com/translate/auth",
      { method: "GET" }
    );
    if (!res2.ok) throw new Error("Cannot obtain TTS token");
    return await res2.text();
  }
  const data = await res.json();
  return data.t || data.token || "";
}

async function synthesize(text: string): Promise<ArrayBuffer> {
  // Use Azure's free TTS REST endpoint (same as Edge Read Aloud)
  const ssml = buildSSML(text);

  // Try the eastus region free endpoint
  const response = await fetch(
    "https://eastus.api.speech.microsoft.com/cognitiveservices/v1",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent": "Mozilla/5.0",
      },
      body: ssml,
    }
  );

  // If the free endpoint requires auth, try Bing Translator TTS
  if (!response.ok) {
    console.log("Azure direct failed, trying Bing Translator TTS...");
    return await synthesizeViaBing(text);
  }

  return await response.arrayBuffer();
}

async function synthesizeViaBing(text: string): Promise<ArrayBuffer> {
  // Bing Translator's Read Aloud endpoint (free, no auth)
  const params = new URLSearchParams({
    text: text.slice(0, 3000),
    language: "en-US",
    voiceName: VOICE,
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
  });

  const response = await fetch(
    `https://api.cognitive.microsofttranslator.com/cognitiveservices/v1?${params}`,
    {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Bing TTS failed: ${response.status}`);
  }

  return await response.arrayBuffer();
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

    if (!audioBuffer || audioBuffer.byteLength < 100) {
      throw new Error("Empty audio response");
    }

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
