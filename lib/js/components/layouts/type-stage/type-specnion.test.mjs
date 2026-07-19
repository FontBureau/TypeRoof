import { describe, it, expect } from 'vitest';
import { LocalScopeTypeSpecnion } from './type-specnion.mjs';
import { SyntheticValue } from './synthetic-values.mjs';

describe('LocalScopeTypeSpecnion.resolveSyntheticProperties', () => {
    it('drops a synthetic whose dependency resolved to null, no partial-args call', () => {
        // topologicalSortKahn throws on never-declared dependencies, so the
        // realistic trigger is a dependency that was dropped after resolving
        // to null. Pre-fix, 'broken' was called with zero args and re-set.
        const raw = new Map([
            ['a', 2],
            ['nullMid', new SyntheticValue(() => null, ['a'])],
            ['broken', new SyntheticValue((m) => (m ?? 'PARTIAL-ARGS-CALLED'), ['nullMid'])],
        ]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(raw, new Map());
        expect(res.has('nullMid')).toBe(false);
        expect(res.has('broken')).toBe(false);
        expect(res.get('a')).toBe(2);
    });
    it('drops a synthetic whose dependencies are all parent-only', () => {
        const raw = new Map([['alias', new SyntheticValue((x) => x * 10, ['x'])]]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(raw, new Map([['x', 3]]));
        expect(res.has('alias')).toBe(false);
    });
    it('resolves intact dependency chains', () => {
        const raw = new Map([
            ['a', 2],
            ['double', new SyntheticValue((a) => a * 2, ['a'])],
            ['quad', new SyntheticValue((d) => d * 2, ['double'])],
        ]);
        const res = LocalScopeTypeSpecnion.resolveSyntheticProperties(raw, new Map());
        expect(res.get('double')).toBe(4);
        expect(res.get('quad')).toBe(8);
    });
});
