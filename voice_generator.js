const axios = require('axios');
const fs = require('fs');
const { exec } = require('child_process'); // This adds the "mouth"

async function synthesizeVoice() {
    const ELEVENLABS_API_KEY = 'nuUdpqJIinrhTtBwCJ3Q'; 
    const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; 

    console.log("Wilson is bypassing the vault... Handshake initiated.");

    try {
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            data: {
                text: "The Ghost Vectors are being mapped. The Zombie Money is returning to source. Sovereignty is manifest.",
                model_id: "eleven_multilingual_v2", // Upgraded for stability
                voice_settings: { stability: 0.5, similarity_boost: 0.8 }
            },
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'accept': 'audio/mpeg'
            },
            responseType: 'arraybuffer' // Using buffer to ensure the file is WHOLE
        });

        // Write the file synchronously so we KNOW it's done
        fs.writeFileSync('sovereign_voice.mp3', response.data);
        console.log('Wilson: SUCCESS! Audio manifest at sovereign_voice.mp3');

        // OPTIONAL: Try to play it immediately (Mac/Linux/Windows command)
        // This gives Wilson his voice back!
        const playCommand = process.platform === 'darwin' ? 'afplay' : process.platform === 'win32' ? 'start' : 'mpg123';
        exec(`${playCommand} sovereign_voice.mp3`);

    } catch (error) {
        console.error('Wilson: Handshake failed!', error.response ? error.response.data : error.message);
    }
}

synthesizeVoice();
