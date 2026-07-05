import json
from typing import Any

def parse_clean_json(text: str) -> Any:
    """
    Safely extracts and parses a JSON object from a string that may contain surrounding conversational text.
    It finds the first occurrence of '{' and the last occurrence of '}' and parses the substring.

    Args:
        text (str): The raw input string containing potential conversational filler and a JSON block.

    Returns:
        Any: The parsed dictionary or list from the JSON block.

    Raises:
        ValueError: If no valid JSON boundaries are found or if the JSON substring is malformed.
    """
    if not text:
        raise ValueError("Input text is empty or None.")

    start_idx = text.find('{')
    end_idx = text.rfind('}')

    if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
        raise ValueError("No valid JSON object boundaries ('{' and '}') were found in the response.")

    json_substring = text[start_idx:end_idx + 1]

    try:
        return json.loads(json_substring)
    except json.JSONDecodeError as error:
        raise ValueError(f"Failed to parse JSON substring: {error.msg}. Substring was: {json_substring}") from error
