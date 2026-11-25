/**
 * API error -> short on-screen text. Errors come from api.js and carry `kind`
 * ('forbidden' | 'network' | 'timeout' | 'http' | 'parse').
 */
export function describeError(err) {
  const kind = err && err.kind;
  switch (kind) {
    case 'forbidden':
      return 'Cinema service blocked this request (403)';
    case 'network':
      return 'No connection — check internet';
    case 'timeout':
      return 'Service is slow — try again';
    case 'http':
      return 'Service error (' + (err.status || '?') + ')';
    case 'parse':
      return 'Unexpected response from service';
    default:
      return 'Something went wrong';
  }
}
