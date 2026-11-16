// The user's Live/Sample choice, kept in the browser. Live is only used when the server has a
// Snowflake connection; choosing Sample keeps the bundled data even when one exists.
export type Mode = 'live' | 'sample';
const KEY = 'waa-mode';

export function preferSample(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === 'sample';
}
export function setPreferredMode(mode: Mode) {
  window.localStorage.setItem(KEY, mode);
}
