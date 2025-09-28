from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel
from typing import Optional, Dict
import cv2
import numpy as np

from fer import FER
from deepface import DeepFace

router = APIRouter(prefix="/api/mood", tags=["mood"])

detector = FER(mtcnn=True)   # face stuff detect

class MoodIn(BaseModel):
    mood: Optional[str] = None
    confidence: Optional[float] = None

@router.post("")
def set_or_suggest_mood(payload: MoodIn) -> Dict[str, str | float | None]:
    mood = payload.mood or "neutral"
    suggested_trigger = "Crowds" if mood == "stressed" else None
    return {"mood": mood, "suggested_trigger": suggested_trigger, "confidence": payload.confidence}

@router.post("/analyze")
async def analyze_mood(file: UploadFile = File(...)):
    # convert upload : numpy image
    content = await file.read()
    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        return {"error": "Invalid image file."}

    # fer
    emotions = detector.detect_emotions(img)
    fer_result = {}
    if emotions:
        fer_result = emotions[0]["emotions"]
        fer_label = max(fer_result, key=fer_result.get)
    else:
        fer_label = "neutral"

    # deepface
    try:
        df_analysis = DeepFace.analyze(img, actions=["emotion"], enforce_detection=False)

        deep_label = "neutral"

        if isinstance(df_analysis, list):
            if df_analysis and isinstance(df_analysis[0], dict):
                deep_label = df_analysis[0].get("dominant_emotion", "neutral")
        elif isinstance(df_analysis, dict):
            deep_label = df_analysis.get("dominant_emotion", "neutral")

    except Exception:
        deep_label = fer_label  
    # simplify to happy/neutral/stressed
    final_mood = "stressed" if fer_label in ["angry","fear","disgust","sad"] or deep_label in ["angry","fear","disgust","sad"] else \
                 "happy" if fer_label=="happy" or deep_label=="happy" else \
                 "neutral"

    suggested_trigger = "Crowds" if final_mood=="stressed" else None

    return {
        "mood": final_mood,
        "fer_label": fer_label,
        "deepface_label": deep_label,
        "fer_confidences": fer_result,
        "suggested_trigger": suggested_trigger
    }