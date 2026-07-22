import { deepFreeze } from './util.mjs';

// NOTE: the glyph-groups name is historical, the data in fact defines
// character/char-codes that map to glyphs in the font and in text shaping,
// calling it "glyphs" is the wrog term.
import json from '../assets/glyph-groups.json' with { type: 'json' };

const charGroupsData = deepFreeze(json);

export default charGroupsData;
