const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_CHUNK_LENGTH = 180;
const GOOGLE_TRANSLATE_TTS_URL = "https://translate.google.com/translate_tts";

function splitTextIntoChunks(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  const chunks: string[] = [];
  let currentChunk = "";

  const pushChunk = (value: string) => {
    const trimmed = value.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (trimmedSentence.length <= MAX_CHUNK_LENGTH) {
      const candidate = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
      if (candidate.length <= MAX_CHUNK_LENGTH) {
        currentChunk = candidate;
      } else {
        pushChunk(currentChunk);
        currentChunk = trimmedSentence;
      }
      continue;
    }

    pushChunk(currentChunk);
    currentChunk = "";

    const words = trimmedSentence.split(" ");
    let wordChunk = "";

    for (const word of words) {
      if (!word) continue;
      const candidate = wordChunk ? `${wordChunk} ${word}` : word;
      if (candidate.length <= MAX_CHUNK_LENGTH) {
        wordChunk = candidate;
      } else {
        pushChunk(wordChunk);
        wordChunk = word;
      }
    }

    pushChunk(wordChunk);
  }

  pushChunk(currentChunk);
  return chunks;
}

async function synthesizeChunk(text: string): Promise<Uint8Array> {
  const url = new URL(GOOGLE_TRANSLATE_TTS_URL);
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", "en-US");
  url.searchParams.set("q", text);

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "audio/mpeg,*/*",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Translate TTS failed [${response.status}]: ${errorBody}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function synthesize(text: string): Promise<Uint8Array> {
  const chunks = splitTextIntoChunks(text);
  if (chunks.length === 0) {
    throw new Error("No text to synthesize");
  }

  const audioChunks: Uint8Array[] = [];
  for (const chunk of chunks) {
    audioChunks.push(await synthesizeChunk(chunk));
  }

  const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mergedAudio = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of audioChunks) {
    mergedAudio.set(chunk, offset);
    offset += chunk.length;
  }

  return mergedAudio;
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
