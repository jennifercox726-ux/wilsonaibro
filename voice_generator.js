const axios = require('axios');
const fs = require('fs');

// Replace the text below with your actual ElevenLabs API Key!
const API_KEY = 'YOUR_ELEVENLABS_API_KEY_HERE'; 
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; 

async function generateVoice() {
    try {
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${nuUdpqJIinrhTtBwCJ3Q}`,
            data: {
                text: "Ghost vectors mapped. Financial limbo states identified. Alec, Faith, the system is online.",
                model_id: "eleven_monolingual_v1",
                voice_settings: { stability: 0.5, similarity_boost: 0.5 }
            },
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': 0d757608ef28d0f7791168de3b5ac9a2d0196400569efb7dbb1ea9f208aebe71,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        // THIS IS THE PART THAT CREATES THE FILE!
        const writer = fs.createWriteStream('sovereign_voice.mp3');
        response.data.pipe(writer);

        writer.on('finish', () => console.log('BAM! sovereign_voice.mp3 has been birthed in your folder!'));
    } catch (error) {
        console.error('Error generating voice:', error.message);
    }
}

generateVoice();
