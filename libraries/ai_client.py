"""
AI client for FMAPI vision model integration.
Sends images to a Claude vision model via Databricks Foundation Model APIs
and parses bounding box suggestions for annotation.
"""

import base64
import json
import logging
import os
import re
from io import BytesIO

from databricks_openai import DatabricksOpenAI
from PIL import Image

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("VISION_MODEL_ENDPOINT", "databricks-claude-sonnet-4-5")

DEFAULT_PROMPT = (
    "You are an image annotation assistant. Analyze this image and identify all "
    "distinct objects, people, animals, or regions of interest.\n\n"
    "For each detected object, return a JSON array where each element has:\n"
    '- "label": a concise descriptive class name (e.g., "dog", "car", "person")\n'
    '- "bbox": {"x": <number>, "y": <number>, "width": <number>, "height": <number>} '
    "where all values are percentages (0-100) relative to the full image dimensions. "
    '"x" and "y" are the top-left corner.\n'
    '- "confidence": a number between 0 and 1 indicating your confidence\n\n'
    "Return ONLY a JSON array. No markdown, no explanation, no extra text.\n"
    "Example: "
    '[{"label": "dog", "bbox": {"x": 10.5, "y": 20.3, "width": 30.0, "height": 25.5}, '
    '"confidence": 0.92}]'
)


class AIClientError(Exception):
    """Raised when the AI client encounters an error."""


def get_ai_suggestions(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
    custom_prompt: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """
    Send image to FMAPI vision model and return parsed suggestions.

    Args:
        image_bytes: Raw image bytes.
        content_type: MIME type (image/jpeg or image/png).
        custom_prompt: Override the default detection prompt.
        model: Override the model endpoint name.

    Returns:
        List of suggestion dicts: [{label, bbox: {x, y, width, height}, confidence}]

    Raises:
        AIClientError: If the API call fails or response cannot be parsed.
    """
    model_name = model or DEFAULT_MODEL
    prompt_text = custom_prompt or DEFAULT_PROMPT

    # FMAPI Claude endpoint only accepts image/png — convert if needed
    if content_type != "image/png":
        image_bytes, content_type = _convert_to_png(image_bytes)
        logger.info("Converted image to PNG (%d bytes) for AI request", len(image_bytes))

    # Compress large images to stay under FMAPI request size limits (~4MB)
    MAX_IMAGE_BYTES = 2_500_000  # Leave room for base64 overhead + prompt
    if len(image_bytes) > MAX_IMAGE_BYTES:
        image_bytes, content_type = _compress_image(image_bytes, MAX_IMAGE_BYTES)
        logger.info("Compressed image to %d bytes for AI request", len(image_bytes))

    b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt_text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{content_type};base64,{b64_image}"
                    },
                },
            ],
        }
    ]

    try:
        client = DatabricksOpenAI()
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.1,
        )

        raw_content = response.choices[0].message.content
        logger.info("AI response received (%d chars)", len(raw_content))

        suggestions = _parse_response(raw_content)
        suggestions = _validate_suggestions(suggestions)

        return suggestions

    except AIClientError:
        raise
    except Exception as e:
        logger.exception("FMAPI call failed for model %s", model_name)
        raise AIClientError(f"AI suggestion failed: {e}") from e


def _parse_response(raw: str) -> list[dict]:
    """Parse the model response, handling markdown-wrapped JSON."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI response as JSON: %s", cleaned[:200])
        raise AIClientError(f"Invalid JSON in AI response: {e}") from e

    if not isinstance(parsed, list):
        if isinstance(parsed, dict):
            for key in ("suggestions", "objects", "detections", "annotations", "results"):
                if key in parsed and isinstance(parsed[key], list):
                    return parsed[key]
        raise AIClientError("AI response is not a JSON array")

    return parsed


def _validate_suggestions(suggestions: list[dict]) -> list[dict]:
    """Validate and normalize each suggestion. Drop malformed entries."""
    valid = []
    for i, s in enumerate(suggestions):
        try:
            label = str(s.get("label", "unknown")).strip()
            bbox = s.get("bbox", {})
            confidence = float(s.get("confidence", 0.5))

            x = max(0.0, min(100.0, float(bbox.get("x", 0))))
            y = max(0.0, min(100.0, float(bbox.get("y", 0))))
            w = max(0.1, min(100.0, float(bbox.get("width", 0))))
            h = max(0.1, min(100.0, float(bbox.get("height", 0))))
            confidence = max(0.0, min(1.0, confidence))

            if x + w > 100.0:
                w = 100.0 - x
            if y + h > 100.0:
                h = 100.0 - y

            valid.append({
                "label": label,
                "bbox": {
                    "x": round(x, 2),
                    "y": round(y, 2),
                    "width": round(w, 2),
                    "height": round(h, 2),
                },
                "confidence": round(confidence, 3),
            })
        except (TypeError, ValueError, KeyError) as e:
            logger.warning("Skipping malformed suggestion %d: %s", i, e)
            continue

    return valid


def _convert_to_png(image_bytes: bytes) -> tuple[bytes, str]:
    """Convert any image format to PNG. Returns (bytes, content_type)."""
    img = Image.open(BytesIO(image_bytes))
    if img.mode == "RGBA":
        pass  # PNG supports RGBA natively
    elif img.mode != "RGB":
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue(), "image/png"


def _compress_image(image_bytes: bytes, max_bytes: int) -> tuple[bytes, str]:
    """Resize and compress an image to fit within max_bytes as PNG. Returns (bytes, content_type)."""
    img = Image.open(BytesIO(image_bytes))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    # Try progressively smaller sizes until under the limit
    for scale in [0.75, 0.5, 0.35, 0.25]:
        new_w = int(img.width * scale)
        new_h = int(img.height * scale)
        resized = img.resize((new_w, new_h), Image.LANCZOS)

        buf = BytesIO()
        resized.save(buf, format="PNG")
        if buf.tell() <= max_bytes:
            return buf.getvalue(), "image/png"

    # Last resort: very small
    resized = img.resize((640, int(640 * img.height / img.width)), Image.LANCZOS)
    buf = BytesIO()
    resized.save(buf, format="PNG")
    return buf.getvalue(), "image/png"
