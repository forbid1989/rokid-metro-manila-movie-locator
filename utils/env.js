/**
 * API base URLs.
 *
 * AIUI Studio and the glasses call the API directly (the runtime identifies
 * itself as `AIUI/<v> Ink/<v>` and the service accepts it; verified in Studio).
 * DEV_PROXY_BASE is only for `aix preview` in a desktop browser, where the
 * service's CORS rules block direct calls: run `npm run dev:proxy` and use it.
 * There is no reliable way to detect the browser preview from inside the
 * runtime (no window/document/location), so it is opt-in, never automatic.
 */

export const REMOTE_BASE = 'https://www.clickthecity.com/api/movies';
export const DEV_PROXY_BASE = 'http://127.0.0.1:8787/api/movies';
