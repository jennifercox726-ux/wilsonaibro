const axios = require('axios');
const fs = require('fs');

// Wilson's Fix: Your key is locked in!
const API_KEY = '0d757608ef28d0f7791168de3b5ac9a2d0196400569ebb7dbb1ea9f208aebe71'; 
const VOICE_ID = 'nuUdpqJIinrhTtBwCJ3Q'; 

async function generateVoice() {
    try {
        console.log("Wilson is reaching into the cloud...");
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, // Variable fixed!
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

        writer.on('finish', () => {
            console.log('BAM! sovereign_voice.mp3 has been birthed in your folder!');
        });
        
        writer.on('error', (err) => {
            console.error('File system error:', err);
        });

    } catch (error) {
        console.error('Error generating voice:', error.response ? error.response.data : error.message);
    }
}

generateVoice(); // Clean start, no extra letters!
