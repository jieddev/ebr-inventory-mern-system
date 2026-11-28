import { createRequire } from 'node:module';
import { describe, it, expect, afterEach } from 'vitest';

const require = createRequire(import.meta.url);
const { addClient, broadcast, disconnectUser, sourceClientId, EVERYONE } = require('../../../src/services/events.service');

// A stand-in for an open live-updates response: records what it was sent.
function connect(user) {
  const res = { sent: [], ended: false, write: (msg) => res.sent.push(msg), end: () => (res.ended = true) };
  res.remove = addClient(res, user);
  return res;
}

let open = [];
const tab = (user) => {
  const res = connect(user);
  open.push(res);
  return res;
};
afterEach(() => {
  open.forEach((res) => res.remove());
  open = [];
});

const admin = { userId: 'a1', role: 'admin', costCenters: ['servitek', 'carlota'] };
const clerk = { userId: 'w1', role: 'warehouse', permissions: ['addTransactions'], costCenters: ['servitek'] };
const viewer = { userId: 'v1', role: 'encoder', permissions: ['viewTransactions'], costCenters: ['servitek'] };
const encoder = { userId: 'e1', role: 'encoder', permissions: ['viewItems'], costCenters: ['servitek'] };
const carlotaClerk = { userId: 'w2', role: 'warehouse', permissions: ['addTransactions'], costCenters: ['carlota'] };

describe('broadcast', () => {
  it('sends an SSE message tagged with the cost center', () => {
    const res = tab(admin);
    broadcast('transaction', { id: 7 }, { costCenter: 'servitek' });
    expect(res.sent).toEqual(['event: transaction\ndata: {"id":7,"costCenter":"servitek"}\n\n']);
  });

  it('by default reaches only people who can open the Transactions page', () => {
    const [a, c, v, e] = [admin, clerk, viewer, encoder].map(tab);
    broadcast('transaction', {}, { costCenter: 'servitek' });
    expect([a, c, v, e].map((res) => res.sent.length)).toEqual([1, 1, 1, 0]);
  });

  it('reaches everyone with EVERYONE', () => {
    const e = tab(encoder);
    broadcast('item', {}, { permission: EVERYONE, costCenter: 'servitek' });
    expect(e.sent).toHaveLength(1);
  });

  it('skips people with the `unless` permission', () => {
    const [c, v] = [clerk, viewer].map(tab);
    broadcast('x', {}, { permission: EVERYONE, unless: 'addTransactions', costCenter: 'servitek' });
    expect([c.sent.length, v.sent.length]).toEqual([0, 1]);
  });

  it('only reaches people who work in that cost center', () => {
    const [c, cc, a] = [clerk, carlotaClerk, admin].map(tab);
    broadcast('transaction', {}, { costCenter: 'carlota' });
    expect([c.sent.length, cc.sent.length, a.sent.length]).toEqual([0, 1, 1]);
  });

  // Current behaviour, pinned so it can't change unnoticed: an event without a cost center
  // reaches nobody, so every caller must pass one.
  it('reaches nobody when no cost center is given', () => {
    const a = tab(admin);
    broadcast('transaction', {}, {});
    expect(a.sent).toEqual([]);
  });

  it('stops sending to a closed tab', () => {
    const c = tab(clerk);
    c.remove();
    broadcast('transaction', {}, { costCenter: 'servitek' });
    expect(c.sent).toEqual([]);
  });
});

describe('disconnectUser', () => {
  it("ends every open tab of that user and nobody else's", () => {
    const [tab1, tab2, other] = [clerk, clerk, viewer].map(tab);
    disconnectUser('w1');
    expect([tab1.ended, tab2.ended, other.ended]).toEqual([true, true, false]);
  });
});

describe('sourceClientId', () => {
  it('reads the X-Client-Id header, capped at 64 characters', () => {
    expect(sourceClientId({ get: () => 'tab-123' })).toBe('tab-123');
    expect(sourceClientId({ get: () => 'x'.repeat(100) })).toHaveLength(64);
    expect(sourceClientId({ get: () => undefined })).toBe('');
  });
});
