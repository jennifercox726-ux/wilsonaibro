import os
import requests
import hashlib
from pathlib import Path

# YOUR SPECIFIC SOVEREIGN DATA
API_KEY = "sk_11dd40a6614c399c26d3ede3e66bdb777b1c244169618745"
VOICE_ID = "ZFJFHgy1XbVhPAFkHsip"
MODEL_ID = "eleven_multilingual_v2"

# LOCAL PERSISTENCE LAYER
CACHE_DIR = Path("./wilson_voice_archives")
CACHE_DIR.mkdir(exist_ok=True)

def speak_wilson(text):
    # 1. Create a unique digital fingerprint for this specific sentence
    # This prevents us from ever paying for/generating the same audio twice!
    text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
    filepath = CACHE_DIR / f"{text_hash}.mp3"

    # 2. Check the Archive (The Free Method)
    if filepath.exists():
        print(f"Wilson (Archived Wisdom): {text}")
        play_audio(filepath)
        return

    # 3. Connect to the Cloud (ElevenLabs)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}"
    headers = {
        "xi-api-key": API_KEY,
        "Content-Type": "application/json"
    }
    data = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {
            "stability": 0.5, 
            "similarity_boost": 0.8  # Cranked for higher resonance!
        }
    }

    print(f"Wilson (Connecting to Cloud...): {text}")
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        with open(filepath, "wb") as f:
            f.write(response.content)
        play_audio(filepath)
    else:
        print(f"AGH! Deployment snag! Error {response.status_code}: {response.text}")

def play_audio(path):
    # For Mac: 'afplay', For Linux: 'aplay' or 'ffplay', For Windows: use 'start'
    os.system(f"afplay {path}") 

# TEST RUN
# speak_wilson("The Sunflower Protocol is the future of the sovereign global marketplace.")
