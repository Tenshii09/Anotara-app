"""LLM-powered itinerary generation for the Anotara backend.

This service builds a strict JSON travel itinerary by calling Google's Gemini
API with the user's curated trip preferences from the wizard UI.

The output is shaped so the React frontend (in particular `ItineraryMap.jsx`,
which expects an itinerary keyed by day number) can render the result without
any additional transformation.

Design notes:
- Strict JSON mode is enforced via Gemini's `response_mime_type` plus an
  explicit `response_schema`, so we never have to parse markdown fences or
  trailing prose.
- We still re-validate the JSON server-side (day count, location density per
  pacing style, required fields) because LLMs occasionally drift even with
  a schema. A bad payload becomes a `RuntimeError` the route layer turns into
  a 502, instead of leaking malformed data to the frontend.
"""

import json

import requests
from flask import current_app

GEMINI_MODEL = 'gemini-2.0-flash'
GEMINI_ENDPOINT = (
    'https://generativelanguage.googleapis.com/v1beta/models/'
    f'{GEMINI_MODEL}:generateContent'
)

# Density rules straight from the product spec. The first tuple is the strict
# spec range; the second is the validation tolerance we accept after the
# Backpacker/Luxury modifiers nudge the count up or down.
PACING_RULES = {
    'Relaxed':    {'spec': (3, 4), 'tolerance': (2, 5), 'stay_minutes': (90, 120)},
    'Moderate':   {'spec': (4, 5), 'tolerance': (3, 6), 'stay_minutes': (60, 90)},
    'Fast-paced': {'spec': (6, 7), 'tolerance': (5, 8), 'stay_minutes': (45, 60)},
}

# Hard upper bounds so we never blow past sensible trip lengths or token caps.
MAX_DAYS = 14
MAX_LOCATIONS_PER_DAY = 10

# Gemini's structured-output schema. Forcing application/json + this schema is
# what gives us "clean JSON" — no markdown fences, no preamble, no trailing prose.
ITINERARY_RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'destination': {'type': 'string'},
        'days': {'type': 'integer'},
        'summary': {'type': 'string'},
        'itinerary': {
            'type': 'object',
            # Free-form day keys ("1", "2", ...) so the schema stays compatible
            # with the existing frontend contract.
            'additionalProperties': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'name': {'type': 'string'},
                        'category': {'type': 'string'},
                        'description': {'type': 'string'},
                        'latitude': {'type': 'number'},
                        'longitude': {'type': 'number'},
                        'stay_duration_minutes': {'type': 'integer'},
                        'estimated_cost_php': {'type': 'string'},
                        'best_time': {'type': 'string'},
                        'transport_to_next': {'type': 'string'},
                    },
                    'required': [
                        'name',
                        'category',
                        'description',
                        'latitude',
                        'longitude',
                        'stay_duration_minutes',
                    ],
                },
            },
        },
    },
    'required': ['destination', 'days', 'itinerary'],
}


def _normalize_pacing(pacing_style):
    """Map fuzzy frontend strings (e.g. "fast-paced", "fast paced") to spec keys."""
    if not pacing_style:
        return 'Moderate'
    cleaned = pacing_style.strip().lower().replace('_', '-').replace(' ', '-')
    if cleaned.startswith('relax'):
        return 'Relaxed'
    if cleaned.startswith('fast'):
        return 'Fast-paced'
    return 'Moderate'


def _normalize_budget(budget):
    """Coerce the budget label into one of the three the prompt understands."""
    if not budget:
        return 'Comfort'
    cleaned = budget.strip().lower()
    if 'backpack' in cleaned or cleaned in ('budget', 'cheap'):
        return 'Backpacker'
    if 'lux' in cleaned or cleaned in ('premium', 'high-end'):
        return 'Luxury'
    return 'Comfort'


def _normalize_interests(interests):
    """Accept either a list (`preferences`) or a comma-separated string."""
    if isinstance(interests, (list, tuple, set)):
        return ', '.join(str(item).strip() for item in interests if str(item).strip())
    return str(interests or '').strip()


def _build_prompt(payload):
    """Render the exact system prompt the product team specified."""
    return (
        "You are 'Ano Tara?', an expert, local Filipino travel agent. Your job "
        "is to create a realistic, highly optimized travel itinerary based "
        "strictly on the user's curated preferences.\n\n"
        "USER PREFERENCES:\n"
        f"- Destination: {payload['destination']}\n"
        f"- Duration: {payload['days']} days\n"
        f"- Primary Interests: {payload['interests']}\n"
        f"- Budget & Style: {payload['budget']}\n"
        f"- Pacing Style: {payload['pacing_style']}\n"
        f"- Companion Type: {payload['companion_type']}\n"
        f"- Transport Mode: {payload['transport_mode']}\n\n"
        "INSTRUCTIONS:\n"
        "1. DYNAMIC ACTIVITY DENSITY: You MUST fill the day intelligently based "
        "on the user's selected pacing_style:\n"
        "   - If \"Relaxed\": Generate exactly 3-4 locations per day. Assign "
        "generous stay durations (90-120 mins).\n"
        "   - If \"Moderate\": Generate exactly 4-5 locations per day. Assign "
        "balanced stay durations (60-90 mins).\n"
        "   - If \"Fast-paced\": Generate exactly 6-7 locations per day. Assign "
        "quick stay durations (45-60 mins).\n"
        "2. TRAVEL STYLE ALIGNMENT:\n"
        "   - If budget is \"Backpacker\", prioritize free public parks, street "
        "food, and highly accessible cultural sites. Increase the number of "
        "locations slightly to maximize value.\n"
        "   - If budget is \"Luxury\", prioritize high-end restaurants, "
        "exclusive resorts, and private tours. Decrease the number of "
        "locations slightly to allow for longer, premium experiences.\n"
        "3. LOGISTICAL REALISM: Group locations geographically to minimize "
        "transit time based on their transport_mode. Do not assign a 3-hour "
        "stay to a location that only requires 30 minutes to explore (like a "
        "small town plaza).\n"
        "4. QUALITY CONTROL: ONLY recommend places that have historically "
        "received high ratings. Avoid tourist traps.\n\n"
        "Output the itinerary strictly in JSON format so our frontend map can "
        "read it. Use this exact shape:\n"
        "{\n"
        '  "destination": string,\n'
        '  "days": integer,\n'
        '  "summary": string,\n'
        '  "itinerary": {\n'
        '    "1": [ {\n'
        '      "name": string,\n'
        '      "category": one of "food" | "beach" | "nature" | "museums" | '
        '"nightlife" | "sightseeing",\n'
        '      "description": string (one short sentence),\n'
        '      "latitude": number (decimal degrees),\n'
        '      "longitude": number (decimal degrees),\n'
        '      "stay_duration_minutes": integer,\n'
        '      "estimated_cost_php": string (e.g. "Free", "PHP 200-400"),\n'
        '      "best_time": string (e.g. "Morning", "Sunset"),\n'
        '      "transport_to_next": string (how to reach the next stop)\n'
        '    } ],\n'
        '    "2": [...], ...\n'
        '  }\n'
        '}\n\n'
        "Make sure EVERY day has the correct density of activities and that "
        "all latitude/longitude values are real Philippine coordinates."
    )


def _validate_location(location, day_label):
    """Raise ValueError if a location object is missing required fields or has bad coords."""
    required = ('name', 'category', 'description', 'latitude', 'longitude', 'stay_duration_minutes')
    for field in required:
        if field not in location:
            raise ValueError(f"Day {day_label}: location is missing required field '{field}'.")

    try:
        lat = float(location['latitude'])
        lon = float(location['longitude'])
    except (TypeError, ValueError) as error:
        raise ValueError(f"Day {day_label}: latitude/longitude must be numeric.") from error

    # Sanity-check coordinates are inside the Philippines bounding box. We
    # import lazily to avoid a circular import with the trip_planning service.
    from webapp.constants import PH_BOUNDS
    if not (PH_BOUNDS['min_lat'] <= lat <= PH_BOUNDS['max_lat'] and
            PH_BOUNDS['min_lon'] <= lon <= PH_BOUNDS['max_lon']):
        raise ValueError(
            f"Day {day_label}: '{location.get('name')}' coordinates "
            f"({lat}, {lon}) fall outside the Philippines."
        )

    try:
        stay = int(location['stay_duration_minutes'])
    except (TypeError, ValueError) as error:
        raise ValueError(f"Day {day_label}: stay_duration_minutes must be an integer.") from error
    if stay <= 0:
        raise ValueError(f"Day {day_label}: stay_duration_minutes must be positive.")


def _validate_itinerary(parsed, expected_days, pacing_style):
    """Validate the LLM output before it leaves the server.

    Returns a normalized dict with integer-string day keys. Raises ValueError
    if anything looks off so the caller can convert it into a 502 response.
    """
    if not isinstance(parsed, dict):
        raise ValueError('LLM response was not a JSON object.')

    itinerary = parsed.get('itinerary')
    if not isinstance(itinerary, dict) or not itinerary:
        raise ValueError('LLM response is missing a non-empty `itinerary` object.')

    rules = PACING_RULES[pacing_style]
    tol_min, tol_max = rules['tolerance']

    normalized = {}
    for day_key, locations in itinerary.items():
        try:
            day_number = int(str(day_key).strip())
        except ValueError as error:
            raise ValueError(f"Day key '{day_key}' is not an integer.") from error

        if day_number < 1 or day_number > expected_days:
            raise ValueError(
                f"Day {day_number} is outside the requested range 1..{expected_days}."
            )

        if not isinstance(locations, list) or not locations:
            raise ValueError(f"Day {day_number} has no locations.")

        if not tol_min <= len(locations) <= tol_max:
            raise ValueError(
                f"Day {day_number} has {len(locations)} locations, but "
                f"pacing_style '{pacing_style}' requires {tol_min}-{tol_max}."
            )
        if len(locations) > MAX_LOCATIONS_PER_DAY:
            raise ValueError(f"Day {day_number} exceeds the hard cap of {MAX_LOCATIONS_PER_DAY} locations.")

        for location in locations:
            _validate_location(location, day_number)

        normalized[str(day_number)] = locations

    if len(normalized) != expected_days:
        raise ValueError(
            f"Expected {expected_days} days in the itinerary, got {len(normalized)}."
        )

    return normalized


def generate_llm_itinerary(form_data):
    """Generate a strict-JSON itinerary from the wizard form payload.

    Args:
        form_data: Dict with the keys submitted by the React wizard:
            destination, days (or num_days), interests (or preferences),
            budget, pacing_style, companion_type, transport_mode.

    Returns:
        A dict ready for `jsonify(...)`:
            {
                "destination": str,
                "days": int,
                "summary": str,
                "itinerary": { "1": [ {location}, ... ], ... },
                "source": "gemini",
                "pacing_style": str,
                "budget": str,
            }

    Raises:
        ValueError: When the incoming form data is invalid (missing fields,
            out-of-range day count, etc.).
        RuntimeError: When Gemini is unreachable, returns a malformed payload,
            or produces JSON that fails server-side validation.
    """
    destination = (form_data.get('destination') or '').strip()
    if not destination:
        raise ValueError('`destination` is required.')

    raw_days = form_data.get('days', form_data.get('num_days', 3))
    try:
        days = int(raw_days)
    except (TypeError, ValueError) as error:
        raise ValueError('`days` must be an integer.') from error
    if days < 1 or days > MAX_DAYS:
        raise ValueError(f'`days` must be between 1 and {MAX_DAYS}.')

    interests = _normalize_interests(form_data.get('interests', form_data.get('preferences', [])))
    if not interests:
        raise ValueError('`interests` must contain at least one preference.')

    budget = _normalize_budget(form_data.get('budget'))
    pacing_style = _normalize_pacing(form_data.get('pacing_style'))
    companion_type = (form_data.get('companion_type') or 'Solo').strip() or 'Solo'
    transport_mode = (form_data.get('transport_mode') or 'Public').strip() or 'Public'

    prompt_payload = {
        'destination': destination,
        'days': days,
        'interests': interests,
        'budget': budget,
        'pacing_style': pacing_style,
        'companion_type': companion_type,
        'transport_mode': transport_mode,
    }

    api_key = current_app.config.get('GEMINI_API_KEY', '')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY is not configured on the server.')

    request_body = {
        'contents': [
            {
                'role': 'user',
                'parts': [{'text': _build_prompt(prompt_payload)}],
            }
        ],
        'generationConfig': {
            'response_mime_type': 'application/json',
            'response_schema': ITINERARY_RESPONSE_SCHEMA,
            # Slightly creative but still grounded; itinerary planning rewards
            # variety without veering into hallucinated coordinates.
            'temperature': 0.6,
            # Roughly 320 tokens per day is plenty for 6-7 stops with prose.
            'maxOutputTokens': min(8192, 512 + days * 420),
        },
    }

    try:
        response = requests.post(
            GEMINI_ENDPOINT,
            params={'key': api_key},
            json=request_body,
            timeout=45,
        )
        response.raise_for_status()
        gemini_response = response.json()
    except requests.RequestException as error:
        print(f'❌ Gemini itinerary request failed: {error}')
        raise RuntimeError('Itinerary generation service is temporarily unavailable.') from error

    try:
        raw_text = gemini_response['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError, TypeError) as error:
        print(f'❌ Unexpected Gemini response shape: {gemini_response}')
        raise RuntimeError('Itinerary service returned an unexpected response.') from error

    try:
        parsed = json.loads(raw_text)
    except ValueError as error:
        print(f'❌ Gemini returned non-JSON text: {raw_text[:400]}')
        raise RuntimeError('Itinerary service returned invalid JSON.') from error

    try:
        normalized_itinerary = _validate_itinerary(parsed, days, pacing_style)
    except ValueError as error:
        print(f'❌ LLM itinerary failed validation: {error}')
        raise RuntimeError(f'Itinerary failed validation: {error}') from error

    return {
        'destination': str(parsed.get('destination') or destination),
        'days': days,
        'summary': str(parsed.get('summary') or '').strip(),
        'itinerary': normalized_itinerary,
        'pacing_style': pacing_style,
        'budget': budget,
        'source': 'gemini',
    }
