/**
 * Safely extracts and parses a JSON object from a string that may contain surrounding conversational text.
 * It finds the first occurrence of '{' and the last occurrence of '}' and parses the substring.
 *
 * @param text The raw input string containing potential conversational filler and a JSON block.
 * @returns The parsed object, or null/error if malformed or not found.
 */
export function parseCleanJSON(text: string): any {
  if (!text) {
    throw new Error("Input text is empty or undefined.");
  }

  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error("No valid JSON object boundaries ('{' and '}') were found in the response.");
  }

  const jsonString = text.substring(startIdx, endIdx + 1);

  try {
    return JSON.parse(jsonString);
  } catch (error: any) {
    throw new Error(`Failed to parse JSON substring: ${error.message}. Substring was: ${jsonString}`);
  }
}
