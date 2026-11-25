/**
 * The cinema directory with caching: kept in memory, and saved to storage for a
 * day so a new session does not repeat six requests. Only a complete directory
 * is saved (a partial one would hide the farther cinemas until it expired).
 */
import { loadDirectory } from './theaters.js';

const KEY = 'directory.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{get: Function, storage?: {getStorageSync, setStorageSync}, now?: Function, ttlMs?: number}} deps
 * @returns {{load: () => Promise<object[]>, invalidate: () => void}}
 */
export function createDirectoryService(deps) {
  const now = deps.now || Date.now;
  const ttlMs = deps.ttlMs || DAY_MS;
  let memory = null;   // { at, theaters }
  let pending = null;

  function readStored() {
    try {
      const raw = deps.storage && deps.storage.getStorageSync(KEY);
      if (raw && Array.isArray(raw.theaters) && raw.theaters.length && now() - raw.at < ttlMs) return raw;
    } catch (e) { /* storage is optional */ }
    return null;
  }

  function save(entry) {
    try {
      if (deps.storage) deps.storage.setStorageSync(KEY, entry);
    } catch (e) { /* storage is optional */ }
  }

  return {
    /** The directory. Concurrent callers share one load; a failed load is retried next time. */
    load: function () {
      if (memory && now() - memory.at < ttlMs) return Promise.resolve(memory.theaters);
      const stored = readStored();
      if (stored) {
        memory = stored;
        return Promise.resolve(stored.theaters);
      }
      if (!pending) {
        pending = loadDirectory(deps.get).then(function (result) {
          const entry = { at: now(), theaters: result.theaters };
          // An incomplete directory is usable now but is not kept past this session's next call.
          if (result.complete) {
            memory = entry;
            save(entry);
          } else {
            memory = { at: now() - ttlMs + 60000, theaters: result.theaters };   // retry in a minute
          }
          return result.theaters;
        }).then(
          function (theaters) { pending = null; return theaters; },
          function (error) { pending = null; throw error; }
        );
      }
      return pending;
    },

    /** Forget everything (e.g. a cinema's schedule 404s, so the directory may be stale). */
    invalidate: function () {
      memory = null;
      save(null);
    },
  };
}
