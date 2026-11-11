// Vercel Serverless Function entrypoint wrapping the Express backend
let app;
let initError = null;

try {
  app = require("../mineshield-backend/server");
} catch (err) {
  initError = err;
}

module.exports = async (req, res) => {
  if (initError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Server Initialization Failed",
        message: initError.message,
        stack: initError.stack
      })
    );
  }

  try {
    if (app.ready) {
      await app.ready;
    }
    return app(req, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        error: "Server Execution Failed",
        message: err.message,
        stack: err.stack
      })
    );
  }
};
