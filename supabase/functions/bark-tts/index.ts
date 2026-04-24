// Bark TTS edge function — calls fal.ai's fal-ai/bark model
// and returns the generated audio URL to the client.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FAL_QUEUE_BASE = "https://queue.fal.run";
const FAL_MODEL = "fal-ai/bark";

interface BarkRequestBody {
  prompt?: string;
  // Optional Bark-specific knobs (passed through if provided)
  text_temp?: number;
  waveform_temp?: number;
  history_prompt?: string;
}

async function pollForResult(
  statusUrl: string,
  resultUrl: string,
  apiKey: string,
  timeoutMs = 120_000,
): Promise<unknown> {
  const start = Date.now();
  const headers = { Authorization: `Key ${apiKey}` };

  while (Date.now() - start < timeoutMs) {
    const statusRes = await fetch(`${statusUrl}?logs=0`, { headers });
    if (!statusRes.ok) {
      const body = await statusRes.text();
      throw new Error(`fal status check failed [${statusRes.status}]: ${body}`);
    }
    const status = await statusRes.json() as { status?: string };

    if (status.status === "COMPLETED") {
      const resultRes = await fetch(resultUrl, { headers });
      if (!resultRes.ok) {
        const body = await resultRes.text();
        throw new Error(`fal result fetch failed [${resultRes.status}]: ${body}`);
      }
      return await resultRes.json();
    }
    if (status.status === "FAILED" || status.status === "CANCELLED") {
      throw new Error(`fal request ${status.status}`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("fal request timed out");
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

  const FAL_KEY = Deno.env.get("FAL_KEY");
  if (!FAL_KEY) {
    return new Response(
      JSON.stringify({ error: "FAL_KEY is not configured" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let body: BarkRequestBody;
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

  // Default voice: Bark "v2/en_speaker_6" — the deepest, warmest English male
  // preset. Slowed waveform + lower text temperature gives a McConaughey-meets-
  // Connery drawl: gravelly, charismatic, unhurried.
  const input: Record<string, unknown> = {
    prompt,
    history_prompt: body.history_prompt ?? "v2/en_speaker_6",
    text_temp: typeof body.text_temp === "number" ? body.text_temp : 0.6,
    waveform_temp:
      typeof body.waveform_temp === "number" ? body.waveform_temp : 0.55,
  };

  try {
    // Submit to fal queue
    const submitRes = await fetch(`${FAL_QUEUE_BASE}/${FAL_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!submitRes.ok) {
      const errBody = await submitRes.text();
      console.error("fal submit failed", submitRes.status, errBody);
      return new Response(
        JSON.stringify({
          error: `fal submit failed [${submitRes.status}]`,
          details: errBody,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const submitJson = await submitRes.json() as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    };

    if (!submitJson.status_url || !submitJson.response_url) {
      return new Response(
        JSON.stringify({
          error: "Unexpected fal submit response",
          details: submitJson,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const result = await pollForResult(
      submitJson.status_url,
      submitJson.response_url,
      FAL_KEY,
    ) as {
      audio?: { url?: string; content_type?: string; file_name?: string };
      audio_url?: string;
    };

    const audioUrl = result.audio?.url ?? result.audio_url ?? null;
    if (!audioUrl) {
      return new Response(
        JSON.stringify({
          error: "fal did not return an audio URL",
          details: result,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        audioUrl,
        contentType: result.audio?.content_type ?? "audio/wav",
        requestId: submitJson.request_id ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Bark generation error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
