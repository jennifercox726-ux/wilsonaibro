// Client-side Edge TTS using Microsoft's neural voices via WebSocket
// This runs in the browser where WebSocket connections to Bing are allowed

const VOICE = "en-GB-RyanNeural";
const TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

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

function uuidNoDashes(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function edgeTTSSynthesize(text: string): Promise<Blob> {
  const connId = uuidNoDashes();
  const reqId = uuidNoDashes();

  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connId}`;
  const ws = new WebSocket(wsUrl);

  const audioChunks: Uint8Array[] = [];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Edge TTS timeout"));
    }, 15000);

    ws.onopen = () => {
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`
      );

      const ssml = buildSSML(text);
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();
          const total = audioChunks.reduce((s, c) => s + c.length, 0);
          const result = new Uint8Array(total);
          let offset = 0;
          for (const chunk of audioChunks) {
            result.set(chunk, offset);
            offset += chunk.length;
          }
          resolve(new Blob([result], { type: "audio/mpeg" }));
        }
      } else {
        let buf: ArrayBuffer;
        if (event.data instanceof Blob) {
          buf = await event.data.arrayBuffer();
        } else if (event.data instanceof ArrayBuffer) {
          buf = event.data;
        } else {
          return;
        }
        const view = new Uint8Array(buf);
        const headerLen = (view[0] << 8) | view[1];
        if (view.length > headerLen + 2) {
          audioChunks.push(view.slice(headerLen + 2));
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("Edge TTS WebSocket error"));
    };

    ws.onclose = (event) => {
      if (audioChunks.length === 0 && !event.wasClean) {
        clearTimeout(timeout);
        reject(new Error("Edge TTS connection closed without audio"));
      }
    };
  });
}
