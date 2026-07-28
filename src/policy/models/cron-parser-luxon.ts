/**
 * cron-parser (the npm library, which uses Luxon for timezone math).
 * Its README states it handles DST "correctly" but, as fetched
 * 2026-07-27 (https://github.com/harrisiirak/cron-parser), does not
 * document the convention: whether a repeated time fires once or
 * twice, or whether a skipped time is dropped or shifted. The policy
 * is implicit in the implementation, so both hazard branches are
 * UNDEFINED until phase 6 observes the real library.
 */

import { decideUndefinedAtHazards } from './common';
import type { PolicyModel } from '../types';

/** The cron-parser-luxon model, gap and fold unverified. */
export const cronParserLuxonModel: PolicyModel = {
  id: 'cron-parser-luxon',
  decide: decideUndefinedAtHazards,
};
