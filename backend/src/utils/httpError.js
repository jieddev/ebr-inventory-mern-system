// Throw from any handler; errorHandler turns it into a JSON response.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
