/**
 * Echoes assistant deltas to stdout while the model is still answering, so the
 * terminal shows the reply forming instead of looking frozen for the whole
 * `cursor-agent` call.
 *
 * `<<<MEMORY_WRITE … MEMORY_WRITE>>>` blocks are stripped from the canonical
 * reply but not from the raw stream, so echoing must stop as soon as the
 * opening marker shows up; `finish()` then prints the remainder of the already
 * cleaned reply.
 */

const MEMORY_WRITE_OPEN_MARKER = '<<<MEMORY_WRITE';

export type WriteFn = (text: string) => void;

export interface StdoutLiveReply {
  /** Echoes one assistant delta as it arrives. */
  readonly pushDelta: (text: string) => void;
  /** Prints whatever of the canonical reply has not been echoed yet. */
  readonly finish: (finalReply: string) => void;
}

export function createStdoutLiveReply(write?: WriteFn): StdoutLiveReply {
  const writeOut = write ?? writeToProcessStdout;
  let echoed = '';
  let held = '';
  let isEchoing = true;

  const emit = (text: string): void => {
    if (text === '') {
      return;
    }
    echoed += text;
    writeOut(text);
  };

  const pushDelta = (text: string): void => {
    if (!isEchoing) {
      return;
    }
    held += text;

    const markerAt = held.indexOf(MEMORY_WRITE_OPEN_MARKER);
    if (markerAt >= 0) {
      emit(held.slice(0, markerAt));
      held = '';
      isEchoing = false;
      return;
    }

    const holdBack = partialMarkerTailLength(held);
    emit(held.slice(0, held.length - holdBack));
    held = held.slice(held.length - holdBack);
  };

  const finish = (finalReply: string): void => {
    if (isEchoing) {
      emit(held);
      held = '';
    }

    emit(resolveRemainder(finalReply, echoed));
    if (!echoed.endsWith('\n')) {
      emit('\n');
    }
  };

  return { pushDelta, finish };
}

/**
 * What still has to be printed once the live echo is done. Everything echoed so
 * far is a prefix of the canonical reply, since stripping only removes text
 * from the first marker onwards.
 */
function resolveRemainder(finalReply: string, echoed: string): string {
  if (echoed === '') {
    return finalReply;
  }
  if (finalReply.startsWith(echoed)) {
    return finalReply.slice(echoed.length);
  }
  // Stream and canonical reply diverged: the canonical one wins, on its own line.
  return `\n${finalReply}`;
}

/** Length of the trailing run of `text` that could still grow into the marker. */
function partialMarkerTailLength(text: string): number {
  const longestPossible = Math.min(
    text.length,
    MEMORY_WRITE_OPEN_MARKER.length - 1,
  );
  for (let length = longestPossible; length > 0; length--) {
    if (MEMORY_WRITE_OPEN_MARKER.startsWith(text.slice(text.length - length))) {
      return length;
    }
  }
  return 0;
}

function writeToProcessStdout(text: string): void {
  process.stdout.write(text);
}
