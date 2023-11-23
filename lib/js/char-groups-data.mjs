/* jshint esversion: 11, module:true, browser: true, unused:true, undef:true, laxcomma: true, laxbreak: true, devel: true, elision: true*/

import {
    deepFreeze
} from './util.mjs';

// NOTE: the glyph-groups name is historical, the data in fact defines
// character/char-codes that map to glyphs in the font and in text shaping,
// calling it "glyphs" is the wrog term.
const charGroupsURL = import.meta.resolve('../assets/glyph-groups.json')
    // jsHint warns here:
    //    "Expected an identifier and instead saw 'await' (a reserved word)."
    // this should be resolved in jshint in the future, maybe with the
    // option "esversion: 13" when available. the "ignore:start/end" can be
    // removed then.
    // See: https://github.com/jshint/jshint/issues/3447
    // Also waiting for: https://v8.dev/features/import-assertions
    // import json from './foo.json' assert { type: 'json' };
    // https://github.com/jshint/jshint/issues/3580
  , charGroupsData = deepFreeze(
        //jshint ignore:start
        await
        // jshint ignore:end
        fetch(charGroupsURL).then(response=>response.json())
    )
  ;

export default charGroupsData;
