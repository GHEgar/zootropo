import { describe, expectTypeOf, it } from 'vitest';
import type { CqlComposer } from '../../../urdimbre/src/cql/index.js';
import type { CqlComposerLike } from '../../src/core/index.js';

describe('CqlComposerLike', () => {
    it('is met by the urdimbre composer', () => {
        expectTypeOf<CqlComposer>().toExtend<CqlComposerLike>();
    });
});
