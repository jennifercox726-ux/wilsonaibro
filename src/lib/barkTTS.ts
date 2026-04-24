import { supabase } from "@/integrations/supabase/client";

export interface BarkResult {
  audioUrl: string;
  contentType: string;
  requestId: string | null;
}

export async function generateBarkAudio(prompt: string): Promise<BarkResult> {
  const { data, error } = await supabase.functions.invoke("bark-tts", {
    body: { prompt },
  });

  if (error) {
    throw new Error(error.message ?? "Failed to call Bark function");
  }
  if (!data?.audioUrl) {
    throw new Error("No audio URL returned from Bark");
  }
  return data as BarkResult;
}
