/**
 * Shared services for the pages: one API client (with its cache), the movie
 * catalog, and the search location. Module-level state, so pages share them.
 */
import { createClient } from './api.js';
import { loadCatalog } from './search.js';
import { resolveLocation } from './location.js';
import { createDirectoryService } from './directoryCache.js';

const CATALOG_TTL_MS = 10 * 60 * 1000;

let api = null;
let catalogPromise = null;
let catalogAt = 0;
let directory = null;

export function getApi() {
  if (!api) api = createClient();
  return api;
}

/** The now-showing catalog (cached 10 minutes; a failed load is retried next time). */
export function getCatalog() {
  if (!catalogPromise || Date.now() - catalogAt > CATALOG_TTL_MS) {
    catalogAt = Date.now();
    catalogPromise = loadCatalog(getApi().get).catch(function (err) {
      catalogPromise = null;
      throw err;
    });
  }
  return catalogPromise;
}

/** The cinema directory (saved for a day in storage; see directoryCache.js). */
export function getDirectory(storage) {
  if (!directory) {
    directory = createDirectoryService({ get: getApi().get, storage: storage || null });
  }
  return directory.load();
}

/** Drop the saved directory so the next call refetches it. */
export function invalidateDirectory() {
  if (directory) directory.invalidate();
}

/**
 * Everything a page needs to understand a spoken command: the movie catalog (required),
 * and the cinema directory and search origin (best effort: without the directory,
 * cinema names are simply not recognised).
 */
export async function getVoiceContext(storage) {
  const catalog = await getCatalog();
  let directory = null;
  try {
    directory = await getDirectory(storage);
  } catch (e) { /* cinema names will not be recognised this time */ }
  const origin = await getLocation();
  return { catalog: catalog, directory: directory, origin: origin };
}

/** Where to search from. Never rejects (see resolveLocation). */
export function getLocation() {
  return resolveLocation();
}

// For tests.
export function resetServices() {
  api = null;
  catalogPromise = null;
  catalogAt = 0;
  directory = null;
}
