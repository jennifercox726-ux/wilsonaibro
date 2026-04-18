// Free Microsoft Edge TTS proxy — converts text to MP3 using a neural voice.
// Runs the WebSocket call server-side so iOS Safari just plays a plain MP3 blob.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
// Davis — deep, grounded American male. With "chat" express-as he sounds
// noticeably more human than the multilingual voices. Best free male option.
const VOICE = "en-US-DavisNeural";

function uuidNoDashes(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function buildSSML(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Slightly slower rate + mstts express-as "chat" style makes Brian sound
  // dramatically more conversational and human, less announcer-like.
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'>
<voice name='${VOICE}'>
<mstts:express-as style='chat' styledegree='1.5'>
<prosody rate='-4%' pitch='-2Hz'>${escaped}</prosody>
</mstts:express-as>
</voice>
</speak>`;
}

async function synthesize(text: string): Promise<Uint8Array> {
  const connId = uuidNoDashes();
  const reqId = uuidNoDashes();
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connId}`;

  const ws = new WebSocket(wsUrl);
  ws.binaryType = "arraybuffer";
  const chunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* noop */ }
      reject(new Error("Edge TTS timeout"));
    }, 20000);

    ws.onopen = () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`
      );
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${buildSSML(text)}`
      );
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          try { ws.close(); } catch { /* noop */ }
          const total = chunks.reduce((s, c) => s + c.length, 0);
          const out = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) { out.set(c, offset); offset += c.length; }
          resolve(out);
        }
      } else {
        const buf = event.data as ArrayBuffer;
        const view = new Uint8Array(buf);
        const headerLen = (view[0] << 8) | view[1];
        if (view.length > headerLen + 2) {
          chunks.push(view.slice(headerLen + 2));
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS WebSocket error"));
    };

    ws.onclose = (event) => {
      if (chunks.length === 0 && !event.wasClean) {
        clearTimeout(timeout);
        reject(new Error("Edge TTS closed without audio"));
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
    const audio = await synthesize(text.slice(0, 5000));
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[edge-tts] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
