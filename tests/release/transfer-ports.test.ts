import { describe, expect, it } from 'vitest';
import type { InventoryMove, InventoryPort, TransferInput, TransferPlan } from '../../src/game/contracts';
import { capacityCases } from './fixtures/contracts';

// A wiring probe: consumes every input and returns typed movements without implementing 07 gameplay.
const transfer: InventoryPort['planTransfer'] = (input, inventory) => {
  let move: InventoryMove;
  switch (input.kind) {
    case 'equipment':
      move = { kind: input.kind, item: input.item, from: inventory.locationById[input.item.id], to: input.destination };
      break;
    case 'pet':
      move = { kind: input.kind, pet: input.pet, from: inventory.petLocationById[input.pet.id], to: input.destination };
      break;
    case 'gem':
      move = { kind: input.kind, drop: input.drop, gem: input.gem };
      break;
    case 'dust':
      move = { kind: input.kind, drop: input.drop, amount: input.amount };
      break;
  }
  return { ok: true, value: { moves: [move], projection: {
    inventory, warehouseCount: inventory.warehouseOrder.length,
    petCount: Object.values(inventory.petLocationById).filter(location => location.kind === 'owned').length,
    returnedGems: [],
  } } };
};

let projectedMoves: readonly InventoryMove[] = [];
const project: InventoryPort['projectNetInventory'] = (moves, inventory) => {
  projectedMoves = moves;
  return { ok: true, value: { inventory, warehouseCount: inventory.warehouseOrder.length,
    petCount: Object.values(inventory.petLocationById).filter(location => location.kind === 'owned').length,
    returnedGems: [],
  } };
};

const cases: { input: TransferInput; expected: InventoryMove }[] = [
  {
    input: { kind: 'equipment', item: { id: 'ground-equipment', version: 1 }, destination: { kind: 'warehouse', order: 60 } },
    expected: { kind: 'equipment', item: { id: 'ground-equipment', version: 1 }, from: { kind: 'ground', dropId: 'overflow-equipment' }, to: { kind: 'warehouse', order: 60 } },
  },
  {
    input: { kind: 'pet', pet: { id: 'ground-pet', version: 1 }, destination: { kind: 'owned' } },
    expected: { kind: 'pet', pet: { id: 'ground-pet', version: 1 }, from: { kind: 'ground', dropId: 'overflow-pet' }, to: { kind: 'owned' } },
  },
  {
    input: { kind: 'gem', drop: { id: 'gem-drop', version: 2 }, gem: { type: 'venom', grade: 1, count: 3 } },
    expected: { kind: 'gem', drop: { id: 'gem-drop', version: 2 }, gem: { type: 'venom', grade: 1, count: 3 } },
  },
  {
    input: { kind: 'dust', drop: { id: 'dust-drop', version: 3 }, amount: 4 },
    expected: { kind: 'dust', drop: { id: 'dust-drop', version: 3 }, amount: 4 },
  },
];

describe('Task 04 typed transfer wiring (not inventory implementation)', () => {
  it.each(cases)('carries $input.kind through the public input, result and projection ports', ({ input, expected }) => {
    const result = transfer(input, capacityCases.overflow.state.inventory);
    if (!result.ok) throw new Error(result.error.message);
    const plan: TransferPlan = result.value;
    expect(plan.moves).toEqual([expected]);
    const projected = project(plan.moves, plan.projection.inventory);
    if (!projected.ok) throw new Error(projected.error.message);
    expect(projectedMoves).toEqual([expected]);
    expect(projected.value.returnedGems).toEqual([]);
    expect(projected.value.petCount).toBe(30);
  });

  it('keeps the negative type cases visible to tsc without executing invalid commands', () => {
    const invalidInputs = () => {
      // @ts-expect-error Equipment cannot acquire pet ownership.
      transfer({ kind: 'equipment', item: { id: 'i1', version: 1 }, destination: { kind: 'owned' } }, capacityCases.full.state.inventory);
      // @ts-expect-error Pets cannot occupy equipment coordinates.
      transfer({ kind: 'pet', pet: { id: 'p1', version: 1 }, destination: { kind: 'equipped', row: 0, col: 0, rotation: 0 } }, capacityCases.full.state.inventory);
      // @ts-expect-error Resource credits identify the verified ground drop.
      transfer({ kind: 'gem', gem: { type: 'venom', grade: 1, count: 2 } }, capacityCases.full.state.inventory);
      // @ts-expect-error Gems have grades 1 through 3.
      transfer({ kind: 'gem', drop: { id: 'g1', version: 1 }, gem: { type: 'venom', grade: 4, count: 2 } }, capacityCases.full.state.inventory);
      // @ts-expect-error Dust is a scalar resource, not a warehouse placement.
      transfer({ kind: 'dust', drop: { id: 'd1', version: 1 }, amount: 2, destination: { kind: 'warehouse', order: 0 } }, capacityCases.full.state.inventory);
      // @ts-expect-error A pet output must retain its pet reference.
      project([{ kind: 'pet', item: { id: 'p1', version: 1 }, from: { kind: 'ground', dropId: 'p-drop' }, to: { kind: 'owned' } }], capacityCases.full.state.inventory);
      // @ts-expect-error A gem output must carry the amount being credited.
      project([{ kind: 'gem', drop: { id: 'g1', version: 1 }, gem: { type: 'venom', grade: 1 } }], capacityCases.full.state.inventory);
      // @ts-expect-error Dust amounts cannot be strings.
      project([{ kind: 'dust', drop: { id: 'd1', version: 1 }, amount: '4' }], capacityCases.full.state.inventory);
    };
    expect(typeof invalidInputs).toBe('function');
  });
});
