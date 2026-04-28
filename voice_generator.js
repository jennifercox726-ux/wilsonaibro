const axios = require('axios');
const fs = require('fs');

// YOUR ELEVENLABS API KEY
const API_KEY = 'YOUR_ELEVENLABS_API_KEY_HERE'; 
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // This is a default voice ID

async function generateVoice() {
    try {
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            data: {
                text: "Ghost vectors mapped. Financial limbo states identified. Alec, Faith, the system is online.",
                model_id: "eleven_monolingual_v1",
                voice_settings: { stability: 0.5, similarity_boost: 0.5 }
            },
            headers: {
                'Accept': 'audio/mpeg',
                'xi-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        const writer = fs.createWriteStream('sovereign_voice.mp3');
        response.data.pipe(writer);

        writer.on('finish', () => console.log('Successfully birthed sovereign_voice.mp3!'));
    } catch (error) {
        console.error('Error generating voice:', error.message);
    }
}

generateVoice();
