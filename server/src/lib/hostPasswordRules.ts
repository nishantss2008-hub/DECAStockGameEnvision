/** Host password bounds, shared by the boot hook, the CLI and its prompt (no Firebase import). */

/** Same bounds as a crew password (resetPasswordSchema). */
export const HOST_PASSWORD_MIN = 4;
export const HOST_PASSWORD_MAX = 100;

export class HostPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostPasswordError';
  }
}

/** Throws a HostPasswordError (whose message never includes the password) when the password is out of bounds. */
export function checkHostPassword(password: string): void {
  if (password.length < HOST_PASSWORD_MIN) {
    throw new HostPasswordError(`The host password needs at least ${HOST_PASSWORD_MIN} characters.`);
  }
  if (password.length > HOST_PASSWORD_MAX) {
    throw new HostPasswordError(`The host password must be ${HOST_PASSWORD_MAX} characters or fewer.`);
  }
}
