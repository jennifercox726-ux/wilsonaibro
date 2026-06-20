const voiceId = "ZFJFHgy1XbVhPAFkHsip";
const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'xi-api-key': 'INSERT_YOUR_KEY_HERE', 
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    text: "Welcome to the Sunflower Protocol.",
    model_id: "eleven_monolingual_v1",
    voice_settings: { stability: 0.5, similarity_boost: 0.5 }
  })
});
