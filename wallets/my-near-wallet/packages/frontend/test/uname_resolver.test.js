import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isUnameDomain, normalizeUname } from '../src/services/UnameResolver.js';

describe('MyNearWallet Universal Name (.uni) Resolver', () => {
    it('identifies valid .uni domains', () => {
        assert.equal(isUnameDomain('peni.uni'), true);
        assert.equal(isUnameDomain('alice.uni'), true);
        assert.equal(isUnameDomain('crypto-whale.uni'), true);
    });

    it('rejects non-.uni or invalid inputs', () => {
        assert.equal(isUnameDomain('peni.near'), false);
        assert.equal(isUnameDomain('alice.eth'), false);
        assert.equal(isUnameDomain('a.uni'), false); // too short
        assert.equal(isUnameDomain(''), false);
        assert.equal(isUnameDomain(null), false);
        assert.equal(isUnameDomain(undefined), false);
    });

    it('normalizes domain names', () => {
        assert.equal(normalizeUname('peni.uni'), 'peni.uni');
        assert.equal(normalizeUname('PENI.UNI'), 'peni.uni');
        assert.equal(normalizeUname('  alice  '), 'alice.uni');
    });
});
