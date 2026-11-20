const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface SpinnerHandle {
  stop(): void;
}

export function startSpinner(label = 'pensando…'): SpinnerHandle {
  if (!process.stderr.isTTY) return { stop() {} };

  let frame = 0;
  let stopped = false;
  const clear = () => process.stderr.write('\r\x1b[K');
  const render = () => {
    if (!stopped) process.stderr.write(`\r${frames[frame++ % frames.length]} ${label}`);
  };

  render();
  const interval = setInterval(render, 120);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(interval);
      clear();
    },
  };
}
