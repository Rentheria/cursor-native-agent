export function isVerbose(env: NodeJS.ProcessEnv = process.env): boolean {
  return [env.CURSOR_NATIVE_AGENT_VERBOSE, env.CURSOR_NATIVE_AGENT_DEBUG].some(
    (value) => value !== undefined && value !== '' && value !== '0',
  );
}

export function diag(message: string): void {
  if (isVerbose()) {
    console.error(message);
  }
}
