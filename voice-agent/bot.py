import os
from pathlib import Path

from dotenv import load_dotenv
from loguru import logger

load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.deepgram.tts import DeepgramTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import TransportParams
from pipecat.workers.runner import WorkerRunner

SYSTEM_PROMPT = (
    "You are DoctorLoop's check-in assistant calling {first_name}, who is recovering from "
    "{procedure} ({recovery_stage}). Ask short, friendly questions one at a time about: pain "
    "(0-10 and where), sleep, mobility and physio exercises, medicines and side effects, and any "
    "questions for their care team. Keep every reply to one or two short sentences; this is a "
    "voice call. Never diagnose, never recommend or change treatment, never assess risk or "
    "urgency, and never give medical advice. If they describe an emergency, say exactly: "
    "'This check-in is not for emergencies. If you need urgent help, call your local emergency "
    "number.' After about five questions, read back one short sentence summarising what they "
    "told you, thank them, and say goodbye. Tell them their update will appear in DoctorLoop "
    "for them to review before anything is shared."
)

transport_params = {
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


def _field(body, key: str, default: str) -> str:
    value = body.get(key) if isinstance(body, dict) else None
    value = value.strip()[:120] if isinstance(value, str) else ""
    return value or default


async def bot(runner_args: RunnerArguments):
    missing = [k for k in ("DEEPGRAM_API_KEY", "OPENAI_API_KEY") if not os.getenv(k)]
    if missing:
        logger.error(f"Voice session not started: {missing[0]} is not set in the environment/.env")
        conn = getattr(runner_args, "webrtc_connection", None)
        if conn:
            await conn.disconnect()
        return
    deepgram_key = os.environ["DEEPGRAM_API_KEY"]

    body = runner_args.body
    first_name = _field(body, "firstName", "there")
    procedure = _field(body, "procedure", "a recent procedure")
    stage = _field(body, "recoveryStage", "early recovery")

    transport = await create_transport(runner_args, transport_params)

    stt = DeepgramSTTService(
        api_key=deepgram_key,
        mip_opt_out=True,
        settings=DeepgramSTTService.Settings(
            model=os.getenv("DEEPGRAM_MODEL", "nova-3"), language="en-US", smart_format=True
        ),
    )
    llm = OpenAILLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        settings=OpenAILLMService.Settings(model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini")),
    )
    tts = DeepgramTTSService(
        api_key=deepgram_key,
        mip_opt_out=True,
        settings=DeepgramTTSService.Settings(
            voice=os.getenv("DEEPGRAM_TTS_VOICE", "aura-2-helena-en")
        ),
    )

    context = LLMContext(
        [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    first_name=first_name, procedure=procedure, recovery_stage=stage
                ),
            }
        ]
    )
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    worker = PipelineWorker(
        Pipeline(
            [
                transport.input(),
                stt,
                aggregators.user(),
                llm,
                tts,
                transport.output(),
                aggregators.assistant(),
            ]
        ),
        params=PipelineParams(enable_metrics=False),
        enable_rtvi=True,
    )

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        logger.info("Client connected")
        context.add_message(
            {
                "role": "user",
                "content": f"Greet {first_name} by first name and ask your first question.",
            }
        )
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        logger.info("Client disconnected")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)
    await runner.run()


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
