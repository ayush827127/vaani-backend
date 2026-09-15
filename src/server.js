const env = require('./config/env');
const app = require('./app');

app.listen(env.port, () => {
  console.log(`VAANI admin backend listening on port ${env.port}`);
});
