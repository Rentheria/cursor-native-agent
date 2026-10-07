import { execFileSync } from 'node:child_process';

export type GitExec = (args: readonly string[], cwd: string) => string;

function defaultGitExec(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
}

/** Current branch name, or undefined when `dir` is not a git work tree. */
export function readGitBranch(
  dir: string,
  gitExec: GitExec = defaultGitExec,
): string | undefined {
  try {
    const out = gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], dir).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

export function isProtectedBranch(branch: string | undefined): boolean {
  if (branch === undefined) {
    return false;
  }
  const name = branch.trim().toLowerCase();
  return name === 'main' || name === 'master';
}
