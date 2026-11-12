// Throw from any handler; errorHandler turns it into a JSON response.
// `extra`: more fields for the JSON body (e.g. { retryAfter }); `headers`: response headers.
class HttpError extends Error {
  constructor(status, message, { extra, headers } = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
    this.headers = headers;
  }
}

module.exports = HttpError;
