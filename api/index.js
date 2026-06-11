const { handleApi } = require("../src/handler");

module.exports = async function handler(req, res) {
  return handleApi(req, res);
};
