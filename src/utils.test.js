import { describe, it, expect } from 'vitest';
import { calcOtPay, computeShiftCompletionUpdate, wipKey } from './utils.js';

describe('calcOtPay', () => {
  it('returns zero when produced is at or below target', () => {
    expect(calcOtPay(100, 100, 12.5, 500)).toEqual({ otHours: 0, otPay: 0 });
    expect(calcOtPay(90, 100, 12.5, 500)).toEqual({ otHours: 0, otPay: 0 });
  });

  it('returns zero when there is no rate per hour', () => {
    expect(calcOtPay(120, 100, 0, 500)).toEqual({ otHours: 0, otPay: 0 });
    expect(calcOtPay(120, 100, null, 500)).toEqual({ otHours: 0, otPay: 0 });
  });

  it('returns zero when there is no daily wage', () => {
    expect(calcOtPay(120, 100, 12.5, 0)).toEqual({ otHours: 0, otPay: 0 });
  });

  it('computes OT hours and pay for units produced above target', () => {
    // 20 extra units at 12.5 units/hour = 1.6 OT hours.
    // Hourly rate = 500/8 = 62.5. OT pay = 1.6 * 62.5 = 100.
    const result = calcOtPay(120, 100, 12.5, 500);
    expect(result.otHours).toBeCloseTo(1.6, 2);
    expect(result.otPay).toBeCloseTo(100, 2);
  });
});

// A casting type with a route: fixed(1) -> fixed(2) -> floating(3,4) -> fixed(5).
function makeCastingType() {
  return {
    id: 1,
    name: 'Shaft Blank',
    unit: 'pcs',
    rawBalance: 100,
    lowThreshold: 10,
    nodes: [
      { nodeId: 1, name: 'Rough turn', machineType: 'lathe', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 2, name: 'Drill', machineType: 'drilling', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 3, name: 'Mill A', machineType: 'milling', target: 50, ratePerHour: 6.25, shiftHours: 8 },
      { nodeId: 4, name: 'Mill B', machineType: 'milling', target: 50, ratePerHour: 6.25, shiftHours: 8 },
      { nodeId: 5, name: 'Final inspect', machineType: 'assembly', target: 100, ratePerHour: 12.5, shiftHours: 8 },
    ],
    routes: [{
      routeId: 1,
      name: 'Standard',
      steps: [
        { type: 'fixed', nodeId: 1 },
        { type: 'fixed', nodeId: 2 },
        { type: 'floating', nodeIds: [3, 4] },
        { type: 'fixed', nodeId: 5 },
      ],
    }],
  };
}

describe('computeShiftCompletionUpdate', () => {
  it('bails out with ok:false when nodeId is not in the route', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 999, machineName: 'CNC-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result).toEqual({ ok: false });
  });

  it('first step: pulls from raw stock, pushes output to the next fixed step', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 1, machineName: 'LTH-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedTypes[0].rawBalance).toBe(90); // 100 - 10
    expect(result.updatedWip[wipKey(1, 2)]).toBe(8); // pushed to node 2, the next fixed step
    expect(result.logEntries).toHaveLength(1);
    expect(result.logEntries[0]).toMatchObject({ type: 'out', qty: 10, itemId: 1, machine: 'LTH-1' });
  });

  it('middle fixed step: decrements its own input WIP, pushes to the next step (floating gate)', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const wip = { [wipKey(1, 2)]: 20 };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 2, machineName: 'DRL-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 2)]).toBe(10); // 20 - 10
    expect(result.updatedWip[wipKey(1, 'gate:3')]).toBe(8); // pushed into the floating group's gate
  });

  it('last fixed step: decrements input WIP, writes no forward WIP', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const wip = { [wipKey(1, 5)]: 15 };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 5, machineName: 'ASM-1',
      consumed: 10, total: 9, newPieces: 9, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 5)]).toBe(5); // 15 - 10
    // No other WIP keys should have been touched — nothing comes after the last step.
    expect(Object.keys(result.updatedWip)).toEqual([wipKey(1, 5)]);
  });

  it('floating group, partial release: gate and downstream WIP stay untouched until every node catches up', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const wip = {
      [wipKey(1, 'gate:3')]: 20,
      [wipKey(1, 'floatdone:3:3')]: 5,
      [wipKey(1, 'floatdone:3:4')]: 5, // node 4 hasn't done this round yet
      [wipKey(1, 'floatreleased:gate:3')]: 5,
    };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 3, machineName: 'MIL-1',
      consumed: 3, total: 3, newPieces: 3, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 'floatdone:3:3')]).toBe(8); // 5 + 3, node 3's own count moved
    expect(result.updatedWip[wipKey(1, 'floatdone:3:4')]).toBe(5); // node 4 untouched
    expect(result.updatedWip[wipKey(1, 'gate:3')]).toBe(20); // gate pool unchanged — node 4 is the bottleneck
    expect(result.updatedWip[wipKey(1, 'floatreleased:gate:3')]).toBe(5); // nothing newly released
    expect(result.updatedWip[wipKey(1, 5)]).toBeUndefined(); // nothing pushed downstream
  });

  it('floating group, full release: once every node catches up, the gate shrinks and pushes forward', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const wip = {
      [wipKey(1, 'gate:3')]: 20,
      [wipKey(1, 'floatdone:3:3')]: 8, // node 3 already ahead
      [wipKey(1, 'floatdone:3:4')]: 5, // node 4 about to catch up
      [wipKey(1, 'floatreleased:gate:3')]: 5,
    };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 4, machineName: 'MIL-2',
      consumed: 5, total: 5, newPieces: 5, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 'floatdone:3:4')]).toBe(10); // 5 + 5
    // min(done3=8, done4=10) = 8; already released 5, so 3 newly released.
    expect(result.updatedWip[wipKey(1, 'floatreleased:gate:3')]).toBe(8);
    expect(result.updatedWip[wipKey(1, 'gate:3')]).toBe(17); // 20 - 3
    expect(result.updatedWip[wipKey(1, 5)]).toBe(3); // newly released pieces pushed to the next (last) step
  });

  it('logs defect entries for scrapped casting/machining defects without affecting WIP math', () => {
    const ct = makeCastingType();
    const route = ct.routes[0];
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 1, machineName: 'LTH-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 1, machiningDefects: 2,
    });
    expect(result.ok).toBe(true);
    const defectEntries = result.logEntries.filter(e => e.type === 'defect');
    expect(defectEntries).toHaveLength(2);
    expect(defectEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ qty: 1, stageLabel: expect.stringContaining('Casting defect') }),
      expect.objectContaining({ qty: 2, stageLabel: expect.stringContaining('Machining defect') }),
    ]));
  });
});
