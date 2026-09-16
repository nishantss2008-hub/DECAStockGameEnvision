/**
 * Where `npm run set-host-password` gets the password: ADMIN_PASSWORD, or a hidden prompt asked twice.
 * Pure (no database, no I/O), so it is unit-tested; the CLI is src/seed/setHostPassword.ts.
 */

import { createInterface } from 'node:readline';
import { checkHostPassword } from '../lib/hostPasswordRules';

export interface PasswordSource {
  /** ADMIN_PASSWORD ('' when unset). */
  env: string;
  /** True when stdin and stdout are a terminal. */
  interactive: boolean;
  /** Asks one question without echoing the answer. */
  prompt: (question: string) => Promise<string>;
}

export async function resolveHostPassword(src: PasswordSource): Promise<string> {
  if (src.env) {
    checkHostPassword(src.env);
    return src.env;
  }
  if (!src.interactive) {
    throw new Error('No password given. Set ADMIN_PASSWORD, or run this in a terminal to type it.');
  }
  const first = await src.prompt('New host password: ');
  checkHostPassword(first);
  const second = await src.prompt('Type it again: ');
  if (first !== second) throw new Error("The two passwords didn't match. Nothing changed.");
  return first;
}

/** Reads one line from the terminal without echoing it. */
export function hiddenPrompt(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => {
      if (!asked) {
        out.output.write(s); // the question itself
        asked = true;
      } else if (s.includes('\n') || s.includes('\r')) {
        out.output.write('\n');
      }
    };
    rl.on('SIGINT', () => {
      rl.close();
      reject(new Error('Cancelled. Nothing changed.'));
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
