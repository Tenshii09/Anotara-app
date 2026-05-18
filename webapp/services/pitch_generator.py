# webapp/services/pitch_generator.py
"""Generate a short, travel-style-aware pitch for a curated set of places.

This service calls Google's Gemini API to produce a 1-3 sentence paragraph
explaining why a small set of places (typically the top 3 from the local
ML recommendation engine) is a strong match for the user's chosen travel style
(e.g. 'Comfort', 'Couple', 'Backpacker').

The function returns a plain dict so the route layer can `jsonify` it directly
and the React frontend can render it without any extra parsing.
"""

import json

import requests
from flask import current_app

GEMINI_MODEL = 'gemini-2.0-flash'
GEMINI_ENDPOINT = (
    'https://generativelanguage.googleapis.com/v1beta/models/'
    f'{GEMINI_MODEL}:generateContent'
)

# Gemini's structured-output schema. Forcing application/json + this schema is
# what gives us "clean JSON" — no markdown fences, no preamble, no trailing prose.
PITCH_RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'pitch': {'type': 'string'},
    },
    'required': ['pitch'],
}

MAX_PLACES = 3


def _normalize_place(place):
    """Keep only the fields the LLM actually needs to reason about a stop."""
    return {
        'name': str(place.get('name', '')).strip(),
        'category': str(place.get('category', '')).strip().lower(),
        'city': str(place.get('city', '')).strip(),
        'rating': float(place.get('rating') or 0.0),
        'tags': str(place.get('tags') or '').strip().lower(),
    }


def _build_prompt(places, travel_style):
    """Compose a focused, low-token prompt that names every place explicitly."""
    place_lines = '\n'.join(
        f"- {p['name']} (category: {p['category'] or 'general'}, "
        f"rating: {p['rating']}, city: {p['city'] or 'Philippines'})"
        for p in places
    )
    return (
        "You are Anotara, an upbeat Philippine travel companion.\n"
        f"Travel style: {travel_style}\n"
        "Top 3 places from the local recommendation engine:\n"
        f"{place_lines}\n\n"
        "Write a single 'pitch' paragraph (MAXIMUM 3 sentences) that explains "
        "why THESE 3 SPECIFIC places are a perfect match for the traveler's "
        "style. Reference each place by name at least once across the "
        "paragraph. Sound warm, concrete, and confident. Do not use emojis, "
        "hashtags, markdown, or generic filler."
    )


def _trim_to_three_sentences(text):
    """Hard guarantee: never return more than 3 sentences to the frontend."""
    sentences = [s.strip() for s in text.replace('\n', ' ').split('.') if s.strip()]
    if not sentences:
        return ''
    pitch = '. '.join(sentences[:3]).strip()
    if not pitch.endswith('.'):
        pitch += '.'
    return pitch


def _fallback_pitch(places, travel_style):
    """Used when no Gemini key is configured so the rest of the app keeps working."""
    names = [p['name'] for p in places]
    if len(names) >= 3:
        joined = f'{names[0]}, {names[1]}, and {names[2]}'
    else:
        joined = ' and '.join(names) or 'these spots'
    return (
        f'{joined} together hit the sweet spot for a {travel_style.lower()} '
        'trip in the Philippines, balancing atmosphere, comfort, and '
        'standout local experiences.'
    )


def generate_itinerary_pitch(places, travel_style):
    """Generate the pitch JSON for the given 3 places + travel style.

    Args:
        places: A list of place dicts from the local recommendation engine.
            Each dict must contain at least a `name` field; `category`,
            `city`, `rating`, and `tags` are used when present.
        travel_style: The user's selected style label, e.g. 'Comfort',
            'Couple', 'Backpacker', 'Family'.

    Returns:
        A dict shaped for direct `jsonify(...)` in the route layer:
            {
                "pitch": str,             # 1-3 sentences, no markdown
                "travel_style": str,
                "place_names": [str, ...],
                "source": "gemini" | "fallback",
            }

    Raises:
        ValueError: If `places` is empty or any place is missing a name.
        RuntimeError: If the Gemini API is reachable but returns an
            unusable response.
    """
    if not isinstance(places, list) or len(places) == 0:
        raise ValueError('`places` must be a non-empty list.')

    travel_style = (travel_style or '').strip() or 'Comfort'

    # Cap at 3 to match the product spec; ignore anything beyond.
    normalized = [_normalize_place(p) for p in places[:MAX_PLACES]]
    for place in normalized:
        if not place['name']:
            raise ValueError('Each place must have a non-empty `name`.')

    place_names = [p['name'] for p in normalized]
    api_key = current_app.config.get('GEMINI_API_KEY', '')

    if not api_key:
        print('⚠️  GEMINI_API_KEY not set — returning local fallback pitch.')
        return {
            'pitch': _fallback_pitch(normalized, travel_style),
            'travel_style': travel_style,
            'place_names': place_names,
            'source': 'fallback',
        }

    payload = {
        'contents': [
            {
                'role': 'user',
                'parts': [{'text': _build_prompt(normalized, travel_style)}],
            }
        ],
        'generationConfig': {
            'response_mime_type': 'application/json',
            'response_schema': PITCH_RESPONSE_SCHEMA,
            'temperature': 0.7,
            'maxOutputTokens': 220,
        },
    }

    try:
        response = requests.post(
            GEMINI_ENDPOINT,
            params={'key': api_key},
            json=payload,
            timeout=12,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as error:
        print(f'❌ Gemini pitch request failed: {error}')
        raise RuntimeError('Pitch generation service is temporarily unavailable.') from error

    try:
        raw_text = data['candidates'][0]['content']['parts'][0]['text']
        parsed = json.loads(raw_text)
        pitch_text = (parsed.get('pitch') or '').strip()
    except (KeyError, IndexError, ValueError) as error:
        print(f'❌ Unexpected Gemini response shape: {data}')
        raise RuntimeError('Could not parse pitch response from Gemini.') from error

    pitch_text = _trim_to_three_sentences(pitch_text)
    if not pitch_text:
        raise RuntimeError('Gemini returned an empty pitch.')

    return {
        'pitch': pitch_text,
        'travel_style': travel_style,
        'place_names': place_names,
        'source': 'gemini',
    }
