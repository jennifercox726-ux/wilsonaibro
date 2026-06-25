

## Goal
Extract the existing inline Web Speech API logic from `ChatInput.tsx` into the reusable `useSpeechToText` hook (your exact spec), wire `ChatInput` to use it, and add the missing UX pieces: visible error toasts and live interim transcription appearing in the input field as the user speaks.

## What changes

### 1. Create `src/hooks/useSpeechToText.ts`
Use the exact hook code you provided — `isListening`, `transcript`, `finalTranscript`, `error`, `startListening`, `stopListening`, `resetTranscript`. Defaults: `en-US`, `continuous: true`, `interimResults: true`. Auto-aborts on unmount.

### 2. Refactor `src/components/ChatInput.tsx`
- Delete the ~60 lines of inline `SpeechRecognition` setup, refs, and handlers.
- Call `useSpeechToText()` and wire the existing Mic / MicOff button to `startListening` / `stopListening` (keep the red pulse styling — already on-brand).
- `useEffect` on `transcript` → mirror live interim text into the textarea so words appear as the user speaks.
- `useEffect` on `finalTranscript` → leave finalized text in the input for the user to review and press Send.
- `useEffect` on `error` → fire `toast.error(...)` from `sonner` (already wired in `Index.tsx`) so permission-denied / unsupported-browser failures stop being silent.
- If the API is unavailable, hide the mic button (preserves current behaviour).

### 3. No other files touched
TTS pipeline, edge functions, DB, `Index.tsx` — all untouched. Pure input-side enhancement.

## Decision: don't auto-send on final transcript
Web Speech fires "final" results on every pause, not at end-of-thought. Auto-sending would cut sentences in half. Showing the text in the input + letting the user press Send (or Enter) is safer. Easy to flip later if you want true hands-free.

## Files
- **Create:** `src/hooks/useSpeechToText.ts`
- **Edit:** `src/components/ChatInput.tsx`

