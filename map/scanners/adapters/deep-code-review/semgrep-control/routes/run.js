// Planted: the positive control's JavaScript case. A query parameter reaches a shell.
const { exec } = require('child_process');
module.exports = (req, res) => {
  exec('ls ' + req.query.dir, (e, out) => res.send(out));
};
