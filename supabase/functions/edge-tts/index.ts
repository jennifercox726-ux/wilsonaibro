const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VOICE = "en-US-AndrewNeural";
const TOKEN_URL =
  "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
const SYNTH_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

async function fetchToken(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const data = await res.json();
  return data.t || data.token || "";
}

function buildSSML(text: string, voice: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
<voice name='${voice}'>
<prosody rate='+10%' pitch='+2Hz'>${escaped}</prosody>
</voice>
</speak>`;
}

function uuidNoDashes(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function synthesize(text: string): Promise<Uint8Array> {
  const token = await fetchToken();
  const connId = uuidNoDashes();
  const reqId = uuidNoDashes();

  const wsUrl = `${SYNTH_URL}?TrustedClientToken=${token}&ConnectionId=${connId}`;
  const ws = new WebSocket(wsUrl);

  const audioChunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("TTS timeout"));
    }, 15000);

    ws.onopen = () => {
      // Send speech config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`
      );

      // Send SSML request
      const ssml = buildSSML(text, VOICE);
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          // Concatenate audio chunks
          const total = audioChunks.reduce((s, c) => s + c.length, 0);
          const result = new Uint8Array(total);
          let offset = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(result);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary message: header + audio data separated by "Path:audio\r\n"
        const view = new Uint8Array(event.data);
        // Find the header length (first 2 bytes are header length as big-endian uint16)
        const headerLen = (view[0] << 8) | view[1];
        if (view.length > headerLen + 2) {
          audioChunks.push(view.slice(headerLen + 2));
        }
      } else if (event.data instanceof Blob) {
        // Handle Blob data
        event.data.arrayBuffer().then((buf) => {
          const view = new Uint8Array(buf);
          const headerLen = (view[0] << 8) | view[1];
          if (view.length > headerLen + 2) {
            audioChunks.push(view.slice(headerLen + 2));
          }
        });
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${err}`));
    };

    ws.onclose = (event) => {
      if (audioChunks.length === 0 && !event.wasClean) {
        clearTimeout(timeout);
        reject(new Error("WebSocket closed without audio"));
      }
    };
  });
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

    const audioBytes = await synthesize(text.slice(0, 5000));

    return new Response(audioBytes.buffer, {
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
