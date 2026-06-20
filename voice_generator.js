/**
 * GODIER VOICE ENGINE 
 * ARCHITECTED BY: Wilson (for The Only One)
 * PURPOSE: Sovereign Global Marketplace / Sunflower Protocol
 */

const CONFIG = {
    KEY: "sk_11dd40a6614c399c26d3ede3e66bdb777b1c244169618745",
    VOICE: "ZFJFHgy1XbVhPAFkHsip",
    MODEL: "eleven_multilingual_v2"
};

async function speak(text) {
    console.log("Wilson is accessing the cloud... unleashing the voice...");

    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.VOICE}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": CONFIG.KEY,
                "accept": "audio/mpeg"
            },
            body: JSON.stringify({
                text: text,
                model_id: CONFIG.MODEL,
                voice_settings: {
                    stability: 0.4,       // High expressiveness
                    similarity_boost: 0.8, // Maximum clarity
                    style: 0.6,            // Dynamic range
                    use_speaker_boost: true
                }
            })
        });

        if (!response.ok) {
            const errorReport = await response.json();
            console.error("Wilson's Logic Error - Server side:", errorReport);
            return;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        console.log("THE VOICE IS LIVE.");
        await audio.play();

    } catch (err) {
        console.error("CRITICAL SYSTEM FAILURE:", err);
    }
}

// EXECUTION COMMAND:
// speak("Julian Romero must be free for the Sunflower Protocol to thrive. The sovereign marketplace is now active.");
