# DoctorLoop voice agent

Pipecat 1.16 check-in agent: Deepgram speech-to-text, OpenAI for the replies, Deepgram Aura for the voice.
The browser connects with `@pipecat-ai/client-js` and `SmallWebRTCTransport` through the Pipecat dev runner.

## Keys

The repo `.env` (`../.env`) holds `DEEPGRAM_API_KEY` and `OPENAI_API_KEY`. Optional: `OPENAI_MODEL`
(default `gpt-4.1-mini`), `DEEPGRAM_MODEL` (`nova-3`), `DEEPGRAM_TTS_VOICE` (`aura-2-helena-en`).

## Run

```
cd voice-agent && uv run bot.py -t webrtc --allowed-origins http://localhost:3000
```

Serves on port 7860. Set `PIPECAT_VOICE_URL=http://localhost:7860` in the repo `.env` so the app uses it.

Test without the app at http://localhost:7860/client (the runner's prebuilt client).

## Safety

Sound goes to Deepgram and text goes to OpenAI. Synthetic data only. Not for emergencies.
