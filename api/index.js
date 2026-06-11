module.exports = async function handler(req, res) {
  try {
    const loadedHandler = require("../src/handler");
    const handleApi = typeof loadedHandler === "function"
      ? loadedHandler
      : loadedHandler.handleApi || loadedHandler.default;
    if (typeof handleApi !== "function") {
      throw new TypeError("API handler export is invalid.");
    }
    return await handleApi(req, res);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: "Falha ao iniciar a API.",
      detail: error?.message || String(error)
    }));
  }
};
