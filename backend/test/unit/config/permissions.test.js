import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const { can, defaultPermissions, isPermission } = require('../../../src/config/permissions');
const {
  userCostCenters,
  costCenterFileName,
  costCenterLabel,
  isCostCenter,
  COST_CENTER_VALUES,
} = require('../../../src/config/costCenters');

describe('can', () => {
  it('lets admins do everything', () => {
    expect(can({ role: 'admin', permissions: [] }, 'reconcile')).toBe(true);
  });

  it('uses the stored permissions when there are some', () => {
    const user = { role: 'warehouse', permissions: ['viewItems'] };
    expect(can(user, 'viewItems')).toBe(true);
    expect(can(user, 'addTransactions')).toBe(false);
  });

  it("gives accounts saved before permissions existed their role's defaults", () => {
    expect(can({ role: 'warehouse' }, 'addTransactions')).toBe(true);
    expect(can({ role: 'accounting' }, 'reconcile')).toBe(true);
    expect(can({ role: 'accounting' }, 'addItems')).toBe(false);
  });

  it('treats an empty list as no permissions, not as the defaults', () => {
    expect(can({ role: 'warehouse', permissions: [] }, 'addTransactions')).toBe(false);
  });

  it('refuses when there is no user', () => {
    expect(can(null, 'viewItems')).toBe(false);
  });

  it('hands out copies of the defaults', () => {
    defaultPermissions('encoder').push('reconcile');
    expect(defaultPermissions('encoder')).toEqual(['viewItems', 'addItems']);
    expect(defaultPermissions('nobody')).toEqual([]);
    expect(isPermission('addItems')).toBe(true);
    expect(isPermission('deleteEverything')).toBe(false);
  });
});

describe('userCostCenters', () => {
  it('gives admins every cost center', () => {
    expect(userCostCenters({ role: 'admin' })).toEqual(COST_CENTER_VALUES);
  });

  it('keeps assigned cost centers in the standard order and drops unknown ones', () => {
    const user = { role: 'warehouse', costCenters: ['carlota', 'warehouse-1', 'mars'] };
    expect(userCostCenters(user)).toEqual(['warehouse-1', 'carlota']);
  });

  it('falls back to the single cost center on old accounts', () => {
    expect(userCostCenters({ role: 'encoder', costCenter: 'repair-shop' })).toEqual(['repair-shop']);
    expect(userCostCenters({ role: 'encoder', costCenters: [], costCenter: 'repair-shop' })).toEqual(['repair-shop']);
  });

  it('gives nothing when none is set or there is no user', () => {
    expect(userCostCenters({ role: 'encoder', costCenter: 'mars' })).toEqual([]);
    expect(userCostCenters(null)).toEqual([]);
  });
});

describe('cost center labels', () => {
  it.each([
    ['servitek', 'Servitek_2-7'],
    ['warehouse-1', 'Warehouse_1'],
    ['repair-shop', 'Repair_shop'],
    ['carlota', 'Carlota'],
  ])('file name for %s is %s', (value, expected) => {
    expect(costCenterFileName(value)).toBe(expected);
  });

  it('falls back to the value itself for an unknown cost center', () => {
    expect(costCenterLabel('mars')).toBe('mars');
    expect(isCostCenter('mars')).toBe(false);
  });
});
