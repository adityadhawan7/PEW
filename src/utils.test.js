import { describe, it, expect } from 'vitest';
import { calcOtPay, computeShiftCompletionUpdate, wipKey, computeShiftPay, computeOperatorDayPay, orderDueState, applyDispatchToOrder, maintenanceDueDate, maintenanceDueState, aggregateDailyOutput, aggregateMachineEff, aggregateOperatorPerf, aggregateDefects, aggregateBreakdowns, aggregateMaintCost, aggregateFoundryScore, daysInMonth, finishedOnHand, bomLineAvailable, maxBuildable, computeAssemblyShiftUpdate, assemblyWipKey, operatorAssignments } from './utils.js';

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
    expect(result.updatedWip[wipKey(1, 'entered')]).toBe(10); // cumulative counter, keyed off consumed
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
    // No other WIP keys should have been touched (besides the 'finished' cumulative counter) —
    // nothing comes after the last step in the live pool graph.
    expect(Object.keys(result.updatedWip).sort()).toEqual([wipKey(1, 5), wipKey(1, 'finished')].sort());
    expect(result.updatedWip[wipKey(1, 'finished')]).toBe(9); // total good output at the last step
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
    expect(result.updatedWip[wipKey(1, 'scrapped')]).toBe(3); // 1 casting + 2 machining defects
  });
});

// The real-world route this feature was built for: Bore-Face-OD(3) -> Milling(4) -> Side
// Drill(8) -> Balance(9), a strict fixed backbone, with Drill Tap(6)/Spot Face(7) as a
// side-track that unlocks after Bore-Face-OD (step 0) and must both clear before Balance
// (step 3).
function makeSideTrackCastingType() {
  return {
    id: 1,
    name: 'PP 330 3L',
    unit: 'pcs',
    rawBalance: 1000,
    lowThreshold: 10,
    nodes: [
      { nodeId: 3, name: 'Bore-Face-OD', machineType: 'cnc', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 4, name: 'Milling', machineType: 'milling', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 6, name: 'Drill Tap', machineType: 'drilling', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 7, name: 'Spot Face', machineType: 'drilling', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 8, name: 'Side Drill', machineType: 'vmc', target: 100, ratePerHour: 12.5, shiftHours: 8 },
      { nodeId: 9, name: 'Balance', machineType: 'assembly', target: 100, ratePerHour: 12.5, shiftHours: 8 },
    ],
    routes: [{
      routeId: 2,
      name: 'Direct to CNC',
      steps: [
        { type: 'fixed', nodeId: 3 },
        { type: 'fixed', nodeId: 4 },
        { type: 'fixed', nodeId: 8 },
        { type: 'fixed', nodeId: 9 },
      ],
      sideTracks: [
        { nodeIds: [6, 7], unlocksAfterStepIndex: 0, joinsBeforeStepIndex: 3 },
      ],
    }],
  };
}

describe('computeShiftCompletionUpdate — side-tracks', () => {
  it('bails out with ok:false when two side-tracks join before the same step', () => {
    const ct = makeSideTrackCastingType();
    const route = { ...ct.routes[0], sideTracks: [
      { nodeIds: [6, 7], unlocksAfterStepIndex: 0, joinsBeforeStepIndex: 3 },
      { nodeIds: [10, 11], unlocksAfterStepIndex: 1, joinsBeforeStepIndex: 3 },
    ]};
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 3, machineName: 'CNC-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result).toEqual({ ok: false });
  });

  it('bails out with ok:false when a side-track has an out-of-range joinsBeforeStepIndex', () => {
    const ct = makeSideTrackCastingType();
    const route = { ...ct.routes[0], sideTracks: [
      { nodeIds: [6, 7], unlocksAfterStepIndex: 0, joinsBeforeStepIndex: 99 },
    ]};
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 3, machineName: 'CNC-1',
      consumed: 10, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result).toEqual({ ok: false });
  });

  it('the unlock step pushes output to BOTH the next backbone step AND the side-track gate', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];
    const result = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 3, machineName: 'CNC-2', // Bore-Face-OD, step 0, the unlock point
      consumed: 20, total: 20, newPieces: 20, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedTypes[0].rawBalance).toBe(980); // 1000 - 20
    expect(result.updatedWip[wipKey(1, 4)]).toBe(20); // ordinary next-step push, to Milling
    expect(result.updatedWip[wipKey(1, 'gate:6')]).toBe(20); // ALSO seeded into the side-track's gate
  });

  it('side-track siblings racing: gate stays put until both members catch up (same semantics as an in-sequence floating group)', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];
    const wip = { [wipKey(1, 'gate:6')]: 20 };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 6, machineName: 'DRL-1', // Drill Tap only; Spot Face hasn't run
      consumed: 8, total: 8, newPieces: 8, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 'floatdone:6:6')]).toBe(8);
    expect(result.updatedWip[wipKey(1, 'gate:6')]).toBe(20); // untouched — Spot Face is the bottleneck
    expect(result.updatedWip[wipKey(1, 'tracksarrived:6:9')]).toBeUndefined(); // nothing released toward the join yet
    expect(result.updatedWip[wipKey(1, 9)]).toBeUndefined();
  });

  it('walkthrough 1 — fixed chain races ahead of the side-track; the join banks the excess in chainarrived, releasing only what both sides have cleared', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];

    // Step 0 (Bore-Face-OD): 20 pieces, feeding both Milling and the side-track gate.
    let r = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 3, machineName: 'CNC-2',
      consumed: 20, total: 20, newPieces: 20, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    let wip = r.updatedWip;

    // Step 1 (Milling): consumes 20, produces 18 good.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 4, machineName: 'MILL-1',
      consumed: 20, total: 18, newPieces: 18, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;
    expect(wip[wipKey(1, 8)]).toBe(18); // pushed to Side Drill (step 2), ordinary fixed push

    // Step 2 (Side Drill, the step right before the join): consumes 18, produces 17 good.
    // This is steps[joinsBeforeStepIndex-1], so its output goes to chainarrived, not straight to Balance.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 8, machineName: 'VMC-1',
      consumed: 18, total: 17, newPieces: 17, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;
    expect(wip[wipKey(1, 'chainarrived:9')]).toBe(17);
    expect(wip[wipKey(1, 9)]).toBeUndefined(); // Balance gets nothing yet — side-track hasn't released anything

    // Drill Tap: 5 pieces. Spot Face hasn't run — nothing releases yet.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 6, machineName: 'DRL-1',
      consumed: 5, total: 5, newPieces: 5, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;
    expect(wip[wipKey(1, 9)]).toBeUndefined();

    // Spot Face: 3 pieces. min(doneTap=5, doneFace=3) = 3 -> 3 newly released to the side-track's
    // track-side counter -> join recomputes: min(chainarrived=17, tracksarrived=3) = 3.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 7, machineName: 'DRL-2',
      consumed: 3, total: 3, newPieces: 3, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;
    expect(wip[wipKey(1, 'gate:6')]).toBe(17); // 20 - 3 released
    expect(wip[wipKey(1, 'tracksarrived:6:9')]).toBe(3);
    expect(wip[wipKey(1, 'chainarrived:9')]).toBe(17); // unchanged — still remembers 14 more pieces banked, waiting
    expect(wip[wipKey(1, 9)]).toBe(3); // exactly 3 pieces ready for Balance — nothing lost, nothing double-counted
  });

  it('walkthrough 2 — side-track races ahead of the fixed chain; the join withholds everything until the chain catches up', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];

    // Seed the side-track gate as if Bore-Face-OD already ran (50 available), but Milling/Side
    // Drill have NOT run yet — chainarrived stays at 0.
    let wip = { [wipKey(1, 'gate:6')]: 50 };

    // Drill Tap then Spot Face both fully process 50 pieces.
    let r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 6, machineName: 'DRL-1',
      consumed: 50, total: 50, newPieces: 50, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 7, machineName: 'DRL-2',
      consumed: 50, total: 50, newPieces: 50, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    expect(r.ok).toBe(true);
    wip = r.updatedWip;

    expect(wip[wipKey(1, 'tracksarrived:6:9')]).toBe(50); // side-track fully released its side
    expect(wip[wipKey(1, 9)]).toBeUndefined(); // but Balance gets NOTHING — chainarrived is still 0
    expect(wip[wipKey(1, 'chainarrived:9')]).toBeUndefined();
  });

  it('a side-track member logging defects increments the scrapped counter, same as an ordinary backbone step', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];
    const wip = { [wipKey(1, 'gate:6')]: 20 };
    const result = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 6, machineName: 'DRL-1',
      consumed: 8, total: 6, newPieces: 6, reworkPieces: 0, castingDefects: 1, machiningDefects: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1, 'scrapped')]).toBe(2);
  });

  it('conservation holds end to end: entered - finished - scrapped matches physical reality through a full side-track sequence', () => {
    const ct = makeSideTrackCastingType();
    const route = ct.routes[0];

    // Bore-Face-OD: 20 in, 20 good (feeds both Milling and the side-track gate).
    let r = computeShiftCompletionUpdate([ct], {}, {
      ct, route, nodeId: 3, machineName: 'CNC-2',
      consumed: 20, total: 20, newPieces: 20, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    let wip = r.updatedWip;
    expect(wip[wipKey(1, 'entered')]).toBe(20);

    // Milling: consumes 20, 2 scrapped, 18 good forward.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 4, machineName: 'MILL-1',
      consumed: 20, total: 18, newPieces: 18, reworkPieces: 0, castingDefects: 0, machiningDefects: 2,
    });
    wip = r.updatedWip;
    expect(wip[wipKey(1, 'scrapped')]).toBe(2);

    // Side Drill: consumes 18, all 18 good, banked in chainarrived (side-track hasn't caught up).
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 8, machineName: 'VMC-1',
      consumed: 18, total: 18, newPieces: 18, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    wip = r.updatedWip;

    // Drill Tap then Spot Face both fully clear all 20 (the full gate, not just the 18 that
    // survived Milling — this is the known "scrap on one branch isn't propagated to the other
    // branch's pool" limitation flagged in computeShiftCompletionUpdate's header comment).
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 6, machineName: 'DRL-1',
      consumed: 20, total: 20, newPieces: 20, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    wip = r.updatedWip;
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 7, machineName: 'DRL-2',
      consumed: 20, total: 20, newPieces: 20, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    wip = r.updatedWip;
    // Join releases min(chainarrived=18, tracksarrived=20) = 18 to Balance.
    expect(wip[wipKey(1, 9)]).toBe(18);

    // Balance (the last step): consumes all 18, all good — finished.
    r = computeShiftCompletionUpdate([ct], wip, {
      ct, route, nodeId: 9, machineName: 'ASM-1',
      consumed: 18, total: 18, newPieces: 18, reworkPieces: 0, castingDefects: 0, machiningDefects: 0,
    });
    wip = r.updatedWip;

    expect(wip[wipKey(1, 'entered')]).toBe(20);
    expect(wip[wipKey(1, 'finished')]).toBe(18);
    expect(wip[wipKey(1, 'scrapped')]).toBe(2);
    // entered - finished - scrapped = 0: everything that left raw stock has either finished or
    // been scrapped — no pieces unaccounted for once the whole batch clears the route.
    expect(wip[wipKey(1, 'entered')] - wip[wipKey(1, 'finished')] - wip[wipKey(1, 'scrapped')]).toBe(0);
  });
});

// A minimal wage_log entry — facts only, no money (see computeShiftPay in utils.js).
function makeEntry(over={}) {
  return {
    id: 'wl_1', alertId: 1, date: '2026-07-05', username: 'operator1', operatorName: 'Operator 1',
    machine: 'CNC 1', machineId: 'CNC-1', shiftKey: 'day', job: 'PP 330 3L',
    produced: 100, target: 100, ratePerHour: 12.5, status: 'ok',
    reason: null, decisionNote: null, decidedBy: null,
    ...over,
  };
}

describe('computeShiftPay', () => {
  it('above target: full wage plus OT exactly matching calcOtPay', () => {
    const entry = makeEntry({ produced: 140, target: 100 });
    const result = computeShiftPay(entry, 500);
    const expected = calcOtPay(140, 100, 12.5, 500);
    expect(result.basePay).toBe(500);
    expect(result.otHours).toBe(expected.otHours);
    expect(result.otPay).toBe(expected.otPay); // 40/12.5 h × 62.5 = 200 = 40% of wage
    expect(result.pending).toBe(false);
  });

  it('exactly at target: full wage, zero OT', () => {
    const result = computeShiftPay(makeEntry(), 500);
    expect(result).toEqual({ basePay: 500, otHours: 0, otPay: 0, pending: false });
  });

  it('below target, pending review: proportional pay, flagged pending', () => {
    const result = computeShiftPay(makeEntry({ produced: 80, target: 100, status: 'pending' }), 500);
    expect(result.basePay).toBe(400); // 80% of 500
    expect(result.otPay).toBe(0);
    expect(result.pending).toBe(true);
  });

  it('below target, approved: full wage (legit reason), not pending', () => {
    const result = computeShiftPay(makeEntry({ produced: 80, target: 100, status: 'approved' }), 500);
    expect(result).toEqual({ basePay: 500, otHours: 0, otPay: 0, pending: false });
  });

  it('below target, disapproved: proportional pay, not pending', () => {
    const result = computeShiftPay(makeEntry({ produced: 80, target: 100, status: 'disapproved' }), 500);
    expect(result).toEqual({ basePay: 400, otHours: 0, otPay: 0, pending: false });
  });

  it('missing ratePerHour: full base above target but OT silently zero', () => {
    const result = computeShiftPay(makeEntry({ produced: 140, target: 100, ratePerHour: null }), 500);
    expect(result.basePay).toBe(500);
    expect(result.otPay).toBe(0);
  });

  it('setup-day regression: adjusted target must NOT change the OT rate', () => {
    // Setup ate 2 of 8 hours: target adjusted 100 -> 75 at rate 12.5/h. Producing 85 means
    // 10 extra pieces = 0.8 OT hours = 0.8 × (500/8) = 50.
    // The naive (extra/target)×wage formula would give 10/75×500 = 66.67 — wrong, which is
    // exactly why wage_log snapshots ratePerHour instead of deriving from the target.
    const result = computeShiftPay(makeEntry({ produced: 85, target: 75, ratePerHour: 12.5 }), 500);
    expect(result.basePay).toBe(500);
    expect(result.otHours).toBeCloseTo(0.8, 2);
    expect(result.otPay).toBeCloseTo(50, 2);
  });

  it('target 0 counts as met: full wage, no crash', () => {
    const result = computeShiftPay(makeEntry({ produced: 0, target: 0, ratePerHour: null }), 500);
    expect(result.basePay).toBe(500);
    expect(result.pending).toBe(false);
  });

  it('proportional pay rounds to 2 decimals', () => {
    const result = computeShiftPay(makeEntry({ produced: 33, target: 100, status: 'disapproved' }), 500);
    expect(result.basePay).toBe(165);
  });
});

describe('computeOperatorDayPay', () => {
  it('production, two shifts (one with OT, one approved shortfall): totals exceed one daily wage', () => {
    const entries = [
      makeEntry({ produced: 140, target: 100 }),                          // 500 + 200 OT
      makeEntry({ id: 'wl_2', alertId: 2, produced: 60, target: 100, status: 'approved' }), // 500
    ];
    const result = computeOperatorDayPay({ entries, attendanceStatus: 'present', dailyWage: 500, wageType: 'production' });
    expect(result.basePay).toBe(1000);
    expect(result.otPay).toBe(200);
    expect(result.total).toBe(1200);
    expect(result.pendingCount).toBe(0);
    expect(result.source).toBe('production');
  });

  it('production, no shifts: attendance fallback present/half/absent/unmarked', () => {
    const base = { entries: [], dailyWage: 500, wageType: 'production' };
    expect(computeOperatorDayPay({ ...base, attendanceStatus: 'present' }).total).toBe(500);
    expect(computeOperatorDayPay({ ...base, attendanceStatus: 'half' }).total).toBe(250);
    expect(computeOperatorDayPay({ ...base, attendanceStatus: 'absent' }).total).toBe(0);
    expect(computeOperatorDayPay({ ...base, attendanceStatus: undefined }).total).toBe(0);
    expect(computeOperatorDayPay({ ...base, attendanceStatus: 'present' }).source).toBe('attendance');
  });

  it('production, shifts exist: entries win over a half-day attendance mark', () => {
    const result = computeOperatorDayPay({
      entries: [makeEntry()], attendanceStatus: 'half', dailyWage: 500, wageType: 'production',
    });
    expect(result.total).toBe(500); // full shift pay, half-day mark ignored
    expect(result.source).toBe('production');
  });

  it('production, single pending shortfall: proportional total with pendingCount 1', () => {
    const result = computeOperatorDayPay({
      entries: [makeEntry({ produced: 80, target: 100, status: 'pending' })],
      attendanceStatus: 'present', dailyWage: 500, wageType: 'production',
    });
    expect(result.total).toBe(400);
    expect(result.pendingCount).toBe(1);
  });

  it('daily type with production entries: attendance base kept, only OT added (legacy math)', () => {
    const result = computeOperatorDayPay({
      entries: [makeEntry({ produced: 140, target: 100 })],
      attendanceStatus: 'present', dailyWage: 500, wageType: 'daily',
    });
    expect(result.basePay).toBe(500);  // from attendance, NOT replaced by shift pay
    expect(result.otPay).toBe(200);
    expect(result.total).toBe(700);
    expect(result.source).toBe('attendance');
  });

  it('missing wageType behaves exactly like daily', () => {
    const args = { entries: [makeEntry({ produced: 140, target: 100 })], attendanceStatus: 'present', dailyWage: 500 };
    expect(computeOperatorDayPay({ ...args, wageType: undefined })).toEqual(computeOperatorDayPay({ ...args, wageType: 'daily' }));
  });

  it('daily, absent, no entries: zero', () => {
    const result = computeOperatorDayPay({ entries: [], attendanceStatus: 'absent', dailyWage: 500, wageType: 'daily' });
    expect(result.total).toBe(0);
  });
});

// A two-line customer order (see the Orders section in CLAUDE.md for the shape).
function makeOrder(over={}) {
  return {
    id: 100, customer: 'Sharma Pumps', poRef: 'PO-77', notes: '', createdDate: '2026-07-01',
    dueDate: '2026-07-10', createdBy: 'Admin', status: 'open',
    items: [
      { castingTypeId: 1, qty: 100, dispatched: 0 },
      { castingTypeId: 2, qty: 50, dispatched: 0 },
    ],
    ...over,
  };
}

describe('orderDueState', () => {
  it('far-future due date on an open order is ok', () => {
    expect(orderDueState(makeOrder({ dueDate: '2026-07-30' }), '2026-07-05')).toBe('ok');
  });

  it('exactly leadDays away is dueSoon (inclusive)', () => {
    expect(orderDueState(makeOrder({ dueDate: '2026-07-08' }), '2026-07-05')).toBe('dueSoon');
  });

  it('due today is dueSoon, not overdue', () => {
    expect(orderDueState(makeOrder({ dueDate: '2026-07-05' }), '2026-07-05')).toBe('dueSoon');
  });

  it('past the due date is overdue', () => {
    expect(orderDueState(makeOrder({ dueDate: '2026-07-04' }), '2026-07-05')).toBe('overdue');
  });

  it('completed and cancelled orders have no due state', () => {
    expect(orderDueState(makeOrder({ status: 'completed', dueDate: '2026-07-01' }), '2026-07-05')).toBe(null);
    expect(orderDueState(makeOrder({ status: 'cancelled', dueDate: '2026-07-01' }), '2026-07-05')).toBe(null);
  });
});

describe('applyDispatchToOrder', () => {
  it('partial dispatch increments the right line and keeps the order open', () => {
    const [o] = applyDispatchToOrder([makeOrder()], 100, 1, 30);
    expect(o.items[0].dispatched).toBe(30);
    expect(o.items[1].dispatched).toBe(0);
    expect(o.status).toBe('open');
  });

  it('multi-line: one line full but the other short keeps the order open; both full completes it', () => {
    let orders = applyDispatchToOrder([makeOrder()], 100, 1, 100);
    expect(orders[0].status).toBe('open'); // line 2 still 0/50
    orders = applyDispatchToOrder(orders, 100, 2, 50);
    expect(orders[0].status).toBe('completed');
  });

  it('over-dispatch records the real shipped amount and completes the line', () => {
    const single = makeOrder({ items: [{ castingTypeId: 1, qty: 100, dispatched: 90 }] });
    const [o] = applyDispatchToOrder([single], 100, 1, 25);
    expect(o.items[0].dispatched).toBe(115); // reality, not clamped
    expect(o.status).toBe('completed');
  });

  it('a casting type not on the order leaves everything unchanged', () => {
    const input = [makeOrder()];
    const result = applyDispatchToOrder(input, 100, 999, 10);
    expect(result[0]).toBe(input[0]); // same reference — untouched
  });

  it('other orders in the array are untouched', () => {
    const other = makeOrder({ id: 200, customer: 'Other Co' });
    const result = applyDispatchToOrder([makeOrder(), other], 100, 1, 10);
    expect(result[1]).toBe(other);
  });
});

describe('maintenanceDueDate / maintenanceDueState', () => {
  const sched = (over={}) => ({ id: 1, machineId: 'MIL-1', title: 'Coolant change', intervalDays: 30, lastDoneDate: '2026-06-01', ...over });

  it('due date is lastDoneDate + intervalDays, crossing month boundaries', () => {
    expect(maintenanceDueDate(sched())).toBe('2026-07-01'); // 1 Jun + 30d
    expect(maintenanceDueDate(sched({ lastDoneDate: '2026-12-15', intervalDays: 30 }))).toBe('2027-01-14'); // year boundary
  });

  it('just done: state is ok', () => {
    expect(maintenanceDueState(sched({ lastDoneDate: '2026-07-05' }), '2026-07-06')).toBe('ok'); // due 4 Aug
  });

  it('exactly 7 days before due: dueSoon (inclusive lead)', () => {
    // due = 2026-07-13, today = 2026-07-06 → 7 days out
    expect(maintenanceDueState(sched({ lastDoneDate: '2026-06-13' }), '2026-07-06')).toBe('dueSoon');
  });

  it('due today: dueSoon, not overdue', () => {
    expect(maintenanceDueState(sched({ lastDoneDate: '2026-06-06' }), '2026-07-06')).toBe('dueSoon');
  });

  it('past due: overdue', () => {
    expect(maintenanceDueState(sched({ lastDoneDate: '2026-05-01' }), '2026-07-06')).toBe('overdue'); // was due 31 May
  });

  it('missing lastDoneDate: no due state', () => {
    expect(maintenanceDueState(sched({ lastDoneDate: null }), '2026-07-06')).toBe(null);
  });
});

describe('analytics aggregations', () => {
  const wl = (over={}) => ({ date: '2026-07-05', username: 'op1', operatorName: 'Operator 1', machine: 'CNC 1', machineId: 'CNC-1', produced: 100, target: 100, status: 'ok', ...over });

  it('aggregateDailyOutput zero-fills missing days and sums same-day entries', () => {
    const rows = aggregateDailyOutput([wl(), wl({ produced: 50, target: 100 }), wl({ date: '2026-07-07', produced: 80 })], '2026-07-04', '2026-07-07');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ date: '2026-07-04', produced: 0, target: 0 });   // zero-filled
    expect(rows[1]).toEqual({ date: '2026-07-05', produced: 150, target: 200 }); // summed
    expect(rows[3].produced).toBe(80);
  });

  it('aggregateMachineEff groups by machine with a zero-target guard', () => {
    const rows = aggregateMachineEff([wl(), wl({ produced: 120 }), wl({ machineId: 'VMC-1', machine: 'VMC 1', produced: 5, target: 0 })], '2026-07-01', '2026-07-31');
    const cnc = rows.find(r => r.machineId === 'CNC-1');
    expect(cnc.shifts).toBe(2);
    expect(cnc.eff).toBe(110); // 220/200
    expect(rows.find(r => r.machineId === 'VMC-1').eff).toBe(0); // target 0 → guard, no NaN
  });

  it('aggregateOperatorPerf counts every below-target shift as a shortfall, however it was decided', () => {
    const rows = aggregateOperatorPerf([
      wl(), wl({ status: 'pending', produced: 80 }), wl({ status: 'approved', produced: 70 }), wl({ status: 'disapproved', produced: 60 }),
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].shifts).toBe(4);
    expect(rows[0].shortfalls).toBe(3); // 'ok' doesn't count
  });

  it('aggregateDefects excludes finished-goods dispatch rows from consumption', () => {
    const rows = aggregateDefects([
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'PP 330 3L', qty: 100, stageLabel: 'Direct to CNC · Milling' },
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'PP 330 3L', qty: 40, stageLabel: 'Finished goods dispatch' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].consumed).toBe(100); // the 40 dispatched pieces are not production
  });

  it('aggregateDefects splits casting vs machining faults and computes the rate', () => {
    const rows = aggregateDefects([
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'PP 330 3L', qty: 200, stageLabel: 'Direct to CNC · Milling' },
      { date: '2026-07-05', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 6, stageLabel: 'Direct to CNC · Milling · Casting defect' },
      { date: '2026-07-06', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 4, stageLabel: 'Direct to CNC · Milling · Machining defect' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].castingDefects).toBe(6);
    expect(rows[0].machiningDefects).toBe(4);
    expect(rows[0].rate).toBe(5); // 10/200 = 5%
  });

  it('aggregateDefects: defects with no consumption in range still appear, rate guarded to 0', () => {
    const rows = aggregateDefects([
      { date: '2026-07-05', type: 'defect', itemId: 2, itemName: 'Other', qty: 3, stageLabel: 'R · N · Casting defect' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].castingDefects).toBe(3);
    expect(rows[0].rate).toBe(0);
  });

  it('aggregateBreakdowns filters to breakdown alerts within range, Pareto-sorted', () => {
    const rows = aggregateBreakdowns([
      { date: '2026-07-05', data: { category: 'breakdown', machine: 'CNC 1' } },
      { date: '2026-07-06', data: { category: 'breakdown', machine: 'CNC 1' } },
      { date: '2026-07-06', data: { category: 'breakdown', machine: 'VMC 1' } },
      { date: '2026-07-06', data: { category: 'production', machine: 'CNC 1' } }, // not a breakdown
      { date: '2026-06-01', data: { category: 'breakdown', machine: 'CNC 1' } },  // out of range
    ], '2026-07-01', '2026-07-31');
    expect(rows).toEqual([{ machine: 'CNC 1', count: 2 }, { machine: 'VMC 1', count: 1 }]);
  });

  it('aggregateMaintCost sums costs, tallying null-cost entries without adding money', () => {
    const rows = aggregateMaintCost([
      { date: '2026-07-05', machineId: 'MIL-1', machineName: 'Milling M/C 1', cost: 800 },
      { date: '2026-07-06', machineId: 'MIL-1', machineName: 'Milling M/C 1', cost: null },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].entries).toBe(2);
    expect(rows[0].cost).toBe(800);
  });
});

describe('aggregateFoundryScore', () => {
  // stock_log is stored newest-first — fixtures below follow that convention because the
  // "latest in-entry wins" attribution takes the FIRST 'in' row it sees per itemId.
  it('attributes defects to the supplier on the LATEST stock-in for that casting type', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-06', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 2, stageLabel: 'R · N · Casting defect' },
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 100, supplier: 'New Foundry' },   // latest
      { date: '2026-06-01', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 100, supplier: 'Old Foundry' },  // superseded
    ], '2026-07-01', '2026-07-31');
    const newF = rows.find(r => r.supplier === 'New Foundry');
    expect(newF.castingDefects).toBe(2);
    expect(rows.find(r => r.supplier === 'Old Foundry')).toBeUndefined(); // no in-range activity of its own
  });

  it('aggregates multiple casting types from one foundry into a single row, machining defects excluded', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 100, supplier: 'Sharma Castings' },
      { date: '2026-07-05', type: 'in', itemId: 2, itemName: 'PP 440', qty: 50, supplier: 'Sharma Castings' },
      { date: '2026-07-06', type: 'out', itemId: 1, itemName: 'PP 330 3L', qty: 80, stageLabel: 'R · Milling' },
      { date: '2026-07-06', type: 'out', itemId: 2, itemName: 'PP 440', qty: 20, stageLabel: 'R · Milling' },
      { date: '2026-07-06', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 4, stageLabel: 'R · N · Casting defect' },
      { date: '2026-07-06', type: 'defect', itemId: 2, itemName: 'PP 440', qty: 1, stageLabel: 'R · N · Casting defect' },
      { date: '2026-07-06', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 9, stageLabel: 'R · N · Machining defect' }, // ours, not theirs
    ], '2026-07-01', '2026-07-31');
    expect(rows).toHaveLength(1);
    expect(rows[0].supplied).toBe(150);
    expect(rows[0].castingDefects).toBe(5); // machining defect NOT counted
    expect(rows[0].processed).toBe(100);
    expect(rows[0].rate).toBe(5); // 5/100
    expect(rows[0].castingTypes.sort()).toEqual(['PP 330 3L', 'PP 440']);
  });

  it('rate guards to 0 when nothing was processed in range', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 100, supplier: 'Sharma Castings' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].rate).toBe(0);
    expect(rows[0].supplied).toBe(100);
  });

  it('blank supplier lands in the (unspecified) bucket', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 100, supplier: '' },
      { date: '2026-07-06', type: 'defect', itemId: 1, itemName: 'PP 330 3L', qty: 2, stageLabel: 'R · N · Casting defect' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].supplier).toBe('(unspecified)');
    expect(rows[0].castingDefects).toBe(2);
  });

  it('normalizes supplier names: " Foo " and "foo" are one row with first-seen display casing', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-06', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 50, supplier: ' Foo ' },  // newest first → display casing
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'PP 330 3L', qty: 50, supplier: 'foo' },
    ], '2026-07-01', '2026-07-31');
    expect(rows).toHaveLength(1);
    expect(rows[0].supplier).toBe('Foo');
    expect(rows[0].supplied).toBe(100);
  });
});

describe('daysInMonth', () => {
  it('handles 31-day and 30-day months', () => {
    expect(daysInMonth('2026-07-15')).toBe(31); // July
    expect(daysInMonth('2026-04-01')).toBe(30); // April
  });
  it('handles February in a non-leap and a leap year', () => {
    expect(daysInMonth('2026-02-10')).toBe(28); // 2026 not a leap year
    expect(daysInMonth('2024-02-10')).toBe(29); // 2024 is a leap year
  });
});

describe('computeOperatorDayPay — monthly salary', () => {
  it('present day pays monthlySalary / daysInMonth for that date', () => {
    // July 2026 has 31 days.
    const result = computeOperatorDayPay({ entries: [], attendanceStatus: 'present', monthlySalary: 31000, wageType: 'monthly', date: '2026-07-15' });
    expect(result.basePay).toBe(1000);
    expect(result.source).toBe('attendance');
  });

  it('half day pays half the effective daily rate', () => {
    const result = computeOperatorDayPay({ entries: [], attendanceStatus: 'half', monthlySalary: 31000, wageType: 'monthly', date: '2026-07-15' });
    expect(result.basePay).toBe(500);
  });

  it('absent day pays nothing', () => {
    const result = computeOperatorDayPay({ entries: [], attendanceStatus: 'absent', monthlySalary: 31000, wageType: 'monthly', date: '2026-07-15' });
    expect(result.basePay).toBe(0);
  });

  it('overtime on a monthly-salary day matches calcOtPay at the same effective rate', () => {
    const effectiveDaily = 31000 / 31; // 1000
    const entry = { produced: 140, target: 100, ratePerHour: 12.5, status: 'ok' };
    const result = computeOperatorDayPay({ entries: [entry], attendanceStatus: 'present', monthlySalary: 31000, wageType: 'monthly', date: '2026-07-15' });
    const expectedOt = calcOtPay(140, 100, 12.5, effectiveDaily).otPay;
    expect(result.otPay).toBeCloseTo(expectedOt, 2);
    expect(result.basePay).toBe(1000);
  });

  it('missing monthlySalary pays 0 without crashing', () => {
    const result = computeOperatorDayPay({ entries: [], attendanceStatus: 'present', wageType: 'monthly', date: '2026-07-15' });
    expect(result.basePay).toBe(0);
  });

  it('proration sanity check: 2 present days out of a 30-day, ₹30,000 month sum to exactly ₹2,000', () => {
    const day = () => computeOperatorDayPay({ entries: [], attendanceStatus: 'present', monthlySalary: 30000, wageType: 'monthly', date: '2026-04-05' }).basePay; // April = 30 days
    expect(day() + day()).toBe(2000);
  });
});


// ── Assembly / BOM production ────────────────────────────────
// A casting type stub — finishedOnHand/bomLineAvailable only need id/name/unit, no nodes/routes.
function makeCT(id, name, unit='pcs') { return { id, name, unit }; }
function makePC(id, name, balance, vendor='Acme Vendor') { return { id, name, unit:'pcs', vendor, lowThreshold:10, balance }; }
function makeAssemblyModel(bom, over={}) {
  return { id: 500, name: 'Pump Assembly A', unit: 'pcs', target: 20, ratePerHour: 2.5, shiftHours: 8, bom, ...over };
}

describe('finishedOnHand', () => {
  it('is finished - dispatched - assembled, floored at 0', () => {
    const wip = { [wipKey(1,'finished')]: 100, [wipKey(1,'dispatched')]: 20, [wipKey(1,'assembled')]: 15 };
    expect(finishedOnHand(wip, 1)).toBe(65);
  });

  it('regression: matches the old 2-term formula when assembled is 0', () => {
    const wip = { [wipKey(1,'finished')]: 100, [wipKey(1,'dispatched')]: 40 };
    expect(finishedOnHand(wip, 1)).toBe(60);
  });

  it('floors at 0 rather than going negative', () => {
    const wip = { [wipKey(1,'finished')]: 10, [wipKey(1,'dispatched')]: 5, [wipKey(1,'assembled')]: 20 };
    expect(finishedOnHand(wip, 1)).toBe(0);
  });
});

describe('bomLineAvailable / maxBuildable', () => {
  const castingTypes = [makeCT(1,'Plate'), makeCT(2,'Cover')];
  const purchasedComponents = [makePC(10,'Lever kit',48), makePC(11,'Spring kit',12)];
  const wip = { [wipKey(1,'finished')]: 40, [wipKey(2,'finished')]: 35 };

  it('casting-kind line reads finishedOnHand; purchased-kind line reads balance directly', () => {
    expect(bomLineAvailable(castingTypes, purchasedComponents, wip, { kind:'casting', itemId:1, qty:1 })).toBe(40);
    expect(bomLineAvailable(castingTypes, purchasedComponents, wip, { kind:'purchased', itemId:10, qty:1 })).toBe(48);
  });

  it('the limiting line across a mixed casting+purchased BOM determines maxBuildable', () => {
    const bom = [
      { kind:'casting', itemId:1, qty:1 },   // 40 available / 1 = 40
      { kind:'casting', itemId:2, qty:1 },   // 35 available / 1 = 35
      { kind:'purchased', itemId:10, qty:1 },// 48 available / 1 = 48
      { kind:'purchased', itemId:11, qty:1 },// 12 available / 1 = 12  <- limiting
    ];
    expect(maxBuildable(castingTypes, purchasedComponents, wip, bom)).toBe(12);
  });

  it('a zero-qty line is guarded (no divide-by-zero)', () => {
    const bom = [{ kind:'casting', itemId:1, qty:0 }];
    expect(maxBuildable(castingTypes, purchasedComponents, wip, bom)).toBe(0);
  });

  it('an empty BOM cannot build anything', () => {
    expect(maxBuildable(castingTypes, purchasedComponents, wip, [])).toBe(0);
  });
});

describe('computeAssemblyShiftUpdate', () => {
  const castingTypes = [makeCT(1,'Plate'), makeCT(2,'Cover')];
  const bom = [
    { kind:'casting', itemId:1, qty:1 },
    { kind:'casting', itemId:2, qty:1 },
    { kind:'purchased', itemId:10, qty:1 },
    { kind:'purchased', itemId:11, qty:2 },
  ];
  const model = makeAssemblyModel(bom);

  it('full BOM consumption success: right counters, right stock_log shape', () => {
    const purchasedComponents = [makePC(10,'Lever kit',50), makePC(11,'Spring kit',50)];
    const wip = { [wipKey(1,'finished')]: 40, [wipKey(2,'finished')]: 40 };
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model, machineName:'ASM-1', consumed:10, total:10, newPieces:10, reworkPieces:0, defects:0,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1,'assembled')]).toBe(10);
    expect(result.updatedWip[wipKey(2,'assembled')]).toBe(10);
    expect(result.updatedComponents.find(p=>p.id===10).balance).toBe(40); // 50 - 10*1
    expect(result.updatedComponents.find(p=>p.id===11).balance).toBe(30); // 50 - 10*2
    expect(result.updatedWip[assemblyWipKey(model.id,'finished')]).toBe(10);
    expect(result.logEntries.filter(e=>e.stageLabel.includes('Consumed by assembly'))).toHaveLength(4);
  });

  it('insufficient stock on a casting-kind line blocks the whole build, nothing touched', () => {
    const purchasedComponents = [makePC(10,'Lever kit',50), makePC(11,'Spring kit',50)];
    const wip = { [wipKey(1,'finished')]: 5, [wipKey(2,'finished')]: 40 }; // Plate short
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model, machineName:'ASM-1', consumed:10, total:10, newPieces:10, reworkPieces:0, defects:0,
    });
    expect(result.ok).toBe(false);
    expect(result.shortages.some(s=>s.kind==='casting'&&s.itemId===1)).toBe(true);
  });

  it('insufficient stock on a purchased-kind line blocks the build; purchasedComponents untouched', () => {
    const purchasedComponents = [makePC(10,'Lever kit',3), makePC(11,'Spring kit',50)]; // Lever kit short
    const wip = { [wipKey(1,'finished')]: 40, [wipKey(2,'finished')]: 40 };
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model, machineName:'ASM-1', consumed:10, total:10, newPieces:10, reworkPieces:0, defects:0,
    });
    expect(result.ok).toBe(false);
    expect(result.shortages.some(s=>s.kind==='purchased'&&s.itemId===10)).toBe(true);
  });

  it('reports ALL short lines at once, not just the first', () => {
    const purchasedComponents = [makePC(10,'Lever kit',1), makePC(11,'Spring kit',1)];
    const wip = { [wipKey(1,'finished')]: 1, [wipKey(2,'finished')]: 40 };
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model, machineName:'ASM-1', consumed:10, total:10, newPieces:10, reworkPieces:0, defects:0,
    });
    expect(result.ok).toBe(false);
    expect(result.shortages.length).toBeGreaterThanOrEqual(3); // Plate, Lever kit, Spring kit all short
  });

  it('defects increment the scrapped counter and log a defect row; shortage check uses the full consumed figure', () => {
    const purchasedComponents = [makePC(10,'Lever kit',50), makePC(11,'Spring kit',50)];
    const wip = { [wipKey(1,'finished')]: 12, [wipKey(2,'finished')]: 12 }; // exactly enough for consumed=12
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model, machineName:'ASM-1', consumed:12, total:10, newPieces:10, reworkPieces:0, defects:2,
    });
    expect(result.ok).toBe(true);
    expect(result.updatedWip[wipKey(1,'assembled')]).toBe(12); // consumed, not just total
    expect(result.updatedWip[assemblyWipKey(model.id,'scrapped')]).toBe(2);
    expect(result.logEntries.some(e=>e.type==='defect'&&e.qty===2)).toBe(true);
  });

  it('assembly-model-id / casting-type-id collision: the asm: prefix keeps their counters independent', () => {
    // Same numeric id (1) used for both a casting type and the assembly model.
    const collidingModel = makeAssemblyModel([{ kind:'purchased', itemId:10, qty:1 }], { id: 1 });
    const purchasedComponents = [makePC(10,'Lever kit',50)];
    const wip = {};
    const result = computeAssemblyShiftUpdate(castingTypes, purchasedComponents, wip, {
      model: collidingModel, machineName:'ASM-1', consumed:5, total:5, newPieces:5, reworkPieces:0, defects:0,
    });
    expect(result.ok).toBe(true);
    // The assembly's own 'finished' counter lives under 'asm:1:finished' — completely distinct
    // from wipKey(1,'finished'), which belongs to casting type id 1 and is untouched.
    expect(result.updatedWip[assemblyWipKey(1,'finished')]).toBe(5);
    expect(result.updatedWip[wipKey(1,'finished')]).toBeUndefined();
  });
});

describe('applyDispatchToOrder — itemType', () => {
  it('assembly-kind line dispatches correctly when itemType is assembly', () => {
    const order = makeOrder({ items: [{ itemType:'assembly', assemblyModelId: 500, qty: 20, dispatched: 0 }] });
    const [o] = applyDispatchToOrder([order], 100, 500, 8, 'assembly');
    expect(o.items[0].dispatched).toBe(8);
    expect(o.status).toBe('open');
  });

  it('an assembly dispatch does not match a casting-kind line with the same numeric id', () => {
    const order = makeOrder(); // items use castingTypeId 1 and 2, no itemType field
    const result = applyDispatchToOrder([order], 100, 1, 10, 'assembly');
    expect(result[0]).toBe(order); // untouched — no assembly-kind line to match
  });
});

describe('isPipelineExit exclusion — assembly consumption', () => {
  it('aggregateDefects excludes "Consumed by assembly" rows from the consumed sum', () => {
    const rows = aggregateDefects([
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'Plate', qty: 100, stageLabel: 'Direct route · Milling' },
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'Plate', qty: 40, stageLabel: 'Consumed by assembly · Pump Assembly A' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].consumed).toBe(100); // the 40 consumed-by-assembly pieces are not production
  });

  it('aggregateFoundryScore excludes "Consumed by assembly" rows from the processed sum', () => {
    const rows = aggregateFoundryScore([
      { date: '2026-07-05', type: 'in', itemId: 1, itemName: 'Plate', qty: 200, supplier: 'Sharma Castings' },
      { date: '2026-07-06', type: 'out', itemId: 1, itemName: 'Plate', qty: 100, stageLabel: 'Direct route · Milling' },
      { date: '2026-07-06', type: 'out', itemId: 1, itemName: 'Plate', qty: 40, stageLabel: 'Consumed by assembly · Pump Assembly A' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].processed).toBe(100);
  });

  it('existing "Finished goods dispatch" exclusion still holds', () => {
    const rows = aggregateDefects([
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'Plate', qty: 100, stageLabel: 'Direct route · Milling' },
      { date: '2026-07-05', type: 'out', itemId: 1, itemName: 'Plate', qty: 30, stageLabel: 'Finished goods dispatch' },
    ], '2026-07-01', '2026-07-31');
    expect(rows[0].consumed).toBe(100);
  });
});

describe('wage_log shape produced by an assembly shift', () => {
  it('computeShiftPay treats an assembly-model-shaped entry identically to an equivalent casting entry', () => {
    // An assembly model's target/ratePerHour are stored in exactly the same shape as a casting
    // node's — Dashboard writes the same wage_log entry shape for either job kind, so no wage
    // code needs to change. Prove it by constructing one and comparing to a hand-built casting
    // equivalent with the same numbers.
    const model = makeAssemblyModel([], { target: 20, ratePerHour: 2.5 });
    const assemblyEntry = { produced: 25, target: model.target, ratePerHour: model.ratePerHour, status: 'ok' };
    const castingEntry = { produced: 25, target: 20, ratePerHour: 2.5, status: 'ok' };
    expect(computeShiftPay(assemblyEntry, 500)).toEqual(computeShiftPay(castingEntry, 500));
  });
});

describe('operatorAssignments', () => {
  const cnc = (id, dayOp, nightOp) => ({
    id, name: `CNC ${id}`, shift: 'cnc_vmc',
    shifts: {
      day: { assignedOperator: dayOp, operator: dayOp, prodCount: 10, shiftComplete: false },
      night: { assignedOperator: nightOp, operator: nightOp, prodCount: 20, shiftComplete: false },
    },
  });
  const manual = (id, op) => ({ id, name: `Drill ${id}`, shift: 'manual', assignedOperator: op, operator: op, prodCount: 5 });

  it('returns one merged entry for a day-only cnc assignment', () => {
    const res = operatorAssignments([cnc('CNC1', 'ravi', null)], 'ravi');
    expect(res).toHaveLength(1);
    expect(res[0].shiftKey).toBe('day');
    expect(res[0].machine.prodCount).toBe(10);
    expect(res[0].machine.id).toBe('CNC1');
  });

  it('returns two entries (day then night) when both slots are assigned to the same operator', () => {
    const res = operatorAssignments([cnc('CNC1', 'ravi', 'ravi')], 'ravi');
    expect(res.map(r => r.shiftKey)).toEqual(['day', 'night']);
    expect(res[0].machine.prodCount).toBe(10);
    expect(res[1].machine.prodCount).toBe(20);
  });

  it('returns shiftKey manual for flat machines', () => {
    const res = operatorAssignments([manual('D1', 'ravi')], 'ravi');
    expect(res).toHaveLength(1);
    expect(res[0].shiftKey).toBe('manual');
    expect(res[0].machine.prodCount).toBe(5);
  });

  it('excludes machines assigned to other operators or nobody', () => {
    const res = operatorAssignments([cnc('CNC1', 'suresh', null), manual('D1', null), manual('D2', 'suresh')], 'ravi');
    expect(res).toEqual([]);
  });

  it('returns [] for a null/undefined username even when machines have assignedOperator null', () => {
    expect(operatorAssignments([manual('D1', null), cnc('CNC1', null, null)], null)).toEqual([]);
    expect(operatorAssignments([manual('D1', null)], undefined)).toEqual([]);
  });

  it('picks up legacy flat cnc_vmc machines (no shifts object) via the day-slot migration', () => {
    const legacy = { id: 'CNC9', name: 'CNC 9', shift: 'cnc_vmc', assignedOperator: 'ravi', operator: 'ravi', prodCount: 7 };
    const res = operatorAssignments([legacy], 'ravi');
    expect(res).toHaveLength(1);
    expect(res[0].shiftKey).toBe('day');
    expect(res[0].machine.prodCount).toBe(7);
  });

  it('preserves fleet order across a mixed fleet', () => {
    const res = operatorAssignments([cnc('CNC1', null, 'ravi'), manual('D1', 'ravi'), cnc('CNC2', 'ravi', null)], 'ravi');
    expect(res.map(r => `${r.machine.id}:${r.shiftKey}`)).toEqual(['CNC1:night', 'D1:manual', 'CNC2:day']);
  });
});
