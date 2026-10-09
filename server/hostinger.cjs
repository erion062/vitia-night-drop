'use strict';

// Hostinger LiteSpeed (lnode.js) loads the app with require().
// This project is ESM; Node 22 can require() it only when there is no
// top-level await, and LiteSpeed needs the Express app as module.exports.
module.exports = require('./index.js').default;
