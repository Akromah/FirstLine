from celery import Celery

celery_app = Celery(
    "firstline-worker",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)


@celery_app.task(name="firstline.ai.transcribe_call")
def transcribe_call(audio_uri: str) -> dict:
    return {
        "audio_uri": audio_uri,
        "transcript": "Placeholder transcription from worker pipeline.",
        "confidence": 0.91,
    }


@celery_app.task(name="firstline.ai.score_priority")
def score_priority(call_text: str) -> dict:
    tokens = len(call_text.split())
    score = min(100, 30 + tokens)
    return {"priority_score": score, "rationale": ["token_density_proxy"]}
