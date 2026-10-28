const handler = require('../index');
module.exports = (req, res) => {
  req.url = '/evaluations/submit' + (req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  return handler(req, res);
};
