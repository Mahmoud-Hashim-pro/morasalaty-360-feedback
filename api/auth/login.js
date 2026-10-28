const handler = require('../index');
module.exports = (req, res) => {
  req.url = '/auth/login' + (req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
  return handler(req, res);
};
