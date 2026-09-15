/**
 * Host console error copy: docs/design/COPY.md §11.1 `host-errors`, verbatim
 * (test/copySync.test.ts reads COPY.md and fails when they drift).
 *
 * The server sends `message` in `{ error: code, message }`; the host console shows
 * `title` above it.
 */

export const HOST_ERRORS = {
  exists: {
    title: 'Name already taken',
    message: 'A crew with this name already exists. Names ignore capitals and punctuation, so pick a clearly different name.',
  },
  bad_name: {
    title: 'Check the crew name',
    message: 'Use at least one letter or number. The name admin is kept for the host.',
  },
  not_found: {
    title: 'Crew not found',
    message: "We couldn't find that crew. It may have been removed. Refresh the crew list and try again.",
  },
  busy: {
    title: 'New game in progress',
    message: 'A new game is being prepared. Wait a moment, then try again.',
  },
  bad_request: {
    title: 'Check your entry',
    message: "Something in that request isn't valid. Check the fields and try again.",
  },
  internal: {
    title: 'Something went wrong',
    message: "The server couldn't finish that. Try again. If it keeps failing, ask your developer to check the server logs.",
  },
} as const;

export type HostErrorCode = keyof typeof HOST_ERRORS;
