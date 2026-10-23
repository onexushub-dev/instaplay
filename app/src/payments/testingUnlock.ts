/**
 * TEMPORARY, for field testing: every paid option is on, as if Pro were active. To undo it, revert the commit that
 * added this file (or set this to false). The test suite always runs with it off.
 */
export const UNLOCK_ALL_FOR_TESTING = typeof jest === 'undefined';
