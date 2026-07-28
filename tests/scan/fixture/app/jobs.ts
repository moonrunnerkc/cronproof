import cron from 'node-cron';
import parser from 'cron-parser';

// node-cron call with an explicit timezone
cron.schedule('0 30 9 * * *', runReport, { timezone: 'America/New_York' });

// node-cron call without a timezone: zone is UNKNOWN
cron.schedule('0 0 * * *', runCleanup);

// cron-parser with a tz option
const iter = parser.parseExpression('0 15 10 * * *', { tz: 'Europe/Berlin' });

// this one is inside a comment and must NOT be scanned:
// cron.schedule('0 0 1 1 *', runNever)

const template = `cron.schedule('9 9 9 9 9', ignoreMe)`;

function runReport() {}
function runCleanup() {}
