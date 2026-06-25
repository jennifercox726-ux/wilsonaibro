import { useState, useRef, useCallback, useEffect } from "react";

interface UseSpeechToTextOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}

const isMobile =
  typeof navigator !== "undefined" &&
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const isIOS =
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/.test(navigator.userAgent);

export const useSpeechToText = (options: UseSpeechToTextOptions = {}) => {
  const {
    lang = "en-US",
    // iOS Safari & most mobile browsers don't honor continuous mode reliably.
    // We fake it via auto-restart in onend.
    continuous = !isMobile,
    interimResults = true,
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  // Stable flag the user toggles via start/stop. Survives auto-restarts.
  const wantListeningRef = useRef(false);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setError(
        "Voice input isn't supported in this browser. Try Chrome or Edge — on iPhone, open the published link in Safari (not inside the preview)."
      );
      return;
    }

    // iOS Safari refuses mic inside cross-origin iframes (which the Lovable
    // preview is). Detect and warn before we silently fail.
    if (isIOS && window.self !== window.top) {
      setError(
        "iPhone Safari blocks the mic inside previews. Open your published app link directly in Safari to use voice input."
      );
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = lang;
      recognition.continuous = continuous;
      recognition.interimResults = interimResults;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }
        if (interim) setTranscript(interim);
        if (final) {
          setTranscript(final);
          setFinalTranscript(final);
        }
      };

      recognition.onerror = (event: any) => {
        const code = event.error;
        // "no-speech" / "aborted" are routine on mobile — don't bother the user
        if (code === "no-speech" || code === "aborted") return;

        if (code === "not-allowed" || code === "service-not-allowed") {
          setError(
            "Microphone permission denied. Tap the lock icon in your browser bar → allow Microphone, then try again."
          );
        } else if (code === "audio-capture") {
          setError("No microphone detected on this device.");
        } else if (code === "network") {
          setError("Voice input needs an internet connection.");
        } else {
          setError(`Voice input error: ${code}`);
        }
        wantListeningRef.current = false;
        setIsListening(false);
      };

      recognition.onend = () => {
        // Mobile browsers stop after every phrase — auto-restart if user still wants to listen
        if (wantListeningRef.current && isMobile) {
          try {
            recognition.start();
            return;
          } catch {
            // fall through to stop
          }
        }
        wantListeningRef.current = false;
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      wantListeningRef.current = true;
      recognition.start();
      setIsListening(true);
      setError(null);
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("already started")) {
        // Already running — treat as success
        setIsListening(true);
        return;
      }
      setError(`Couldn't start voice input: ${msg}`);
      wantListeningRef.current = false;
      setIsListening(false);
    }
  }, [lang, continuous, interimResults]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setFinalTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    finalTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
};
