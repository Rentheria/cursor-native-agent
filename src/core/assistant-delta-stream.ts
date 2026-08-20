/**
 * `cursor-agent --stream-partial-output` closes every assistant segment by
 * repeating the whole segment as one extra event. The end-of-turn recap carries
 * no `timestamp_ms` and is already dropped while parsing, but the recap of a
 * segment that ends on a tool call *is* timestamped, so a consumer that appends
 * deltas renders those segments twice.
 *
 * Observed shape of a two-segment turn:
 *   assistant ts=…810 "Voy a revisar el sistema."   ← partial
 *   assistant ts=…812 "Voy a revisar el sistema."   ← segment recap (drop)
 *   tool_call
 *   assistant ts=…640 "Hora actual: **3"           ← partial
 *   assistant ts=…640 ":56:59 PM CST**."           ← partial
 *   assistant ts=null "Hora actual: **3:56:59 …"   ← end recap (already dropped)
 */

/**
 * Wraps a delta consumer so segment recaps are dropped and what it receives
 * concatenates into exactly the final reply.
 */
export function withoutSegmentRecaps(
  onAssistantDelta: (text: string) => void,
): (text: string) => void {
  let segmentText = '';

  return (text: string): void => {
    if (text === segmentText) {
      segmentText = '';
      return;
    }
    segmentText += text;
    onAssistantDelta(text);
  };
}
