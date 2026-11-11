// Vercel Serverless Function entrypoint wrapping the Express backend
const app = require("../mineshield-backend/server");

module.exports = async (req, res) => {
  // Ensure schema and seed data are initialized
  if (app.ready) {
    await app.ready;
  }
  return app(req, res);
};
