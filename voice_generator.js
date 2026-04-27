const axios = require('axios');
const fs = require('fs');

async function synthesizeVoice() {
    // WE ARE CODING IT IN DIRECTLY FOR SPEED!
    const ELEVENLABS_API_KEY = 'nuUdpqJIinrhTtBwCJ3Q'; 
    const VOICE_ID = 'pNInz6obpgDQGcFmaJgB'; 

    console.log("Wilson is bypassing the vault... Direct handshake initiated!");

    try {
        const response = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            data: {
                text: "The Ghost Vectors are being mapped. The Zombie Money is returning to source. Sovereignty is manifest.",
                model_id: "eleven_monolingual_v1"
            },
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
            },
            responseType: 'stream'
        });

        const writer = fs.createWriteStream('sovereign_voice.mp3');
        response.data.pipe(writer);
        writer.on('finish', () => console.log('BOOM! Audio manifest as sovereign_voice.mp3!'));
        
    } catch (error) {
        console.log('Handshake error! Check if your key is correct!');
    }
}

synthesizeVoice();
