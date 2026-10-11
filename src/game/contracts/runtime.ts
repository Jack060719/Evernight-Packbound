import type { ReleaseGameState, RngState } from './state';
import type { ExecutionEnvironment, ExecutionPermission, RandomSource } from './ports';
import { RELEASE_TIMING } from './protocol';

/** A candidate owns its RNG cursor; discarded candidates never advance the saved cursor. */
export function createRandomSource(saved: Readonly<RngState>): RandomSource {
  if (saved.algorithm !== 'xorshift32-v1' || !Number.isInteger(saved.seed) || saved.seed <= 0 || saved.seed > 0xffffffff
    || !Number.isInteger(saved.state) || saved.state <= 0 || saved.state > 0xffffffff
    || !Number.isSafeInteger(saved.draws) || saved.draws < 0) throw new RangeError('Invalid xorshift32 cursor');
  const cursor = { ...saved };
  return {
    next() {
      if (cursor.draws === Number.MAX_SAFE_INTEGER) throw new RangeError('RNG draw counter exhausted');
      let value = cursor.state;
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      cursor.state = value >>> 0;
      cursor.draws++;
      return cursor.state / 0x100000000;
    },
    snapshot: () => ({ ...cursor }),
  };
}

/** Flatten primary targets then extras. Each ordered impact gets a zero-based due tick. */
export function actionHitTicks(impactCount: number): readonly number[] {
  if (!Number.isInteger(impactCount) || impactCount < 1 || impactCount > 8) throw new RangeError('Expected 1 to 8 direct impacts');
  return Array.from({ length: impactCount }, (_, index) => Math.floor(index * RELEASE_TIMING.actionTicks / impactCount));
}

/** Pure gate projection; it never rewrites the persisted repeat preference. */
export function getExecutionPermission(state: Readonly<ReleaseGameState>, environment: ExecutionEnvironment): ExecutionPermission {
  const reasons: string[] = [...state.lifecycle.pauseReasons];
  if (!environment.visible && !reasons.includes('hidden')) reasons.push('hidden');
  if (state.lifecycle.resumeRequired) reasons.push('resume-required');
  if (state.lifecycle.pendingChoice) reasons.push('required-choice');
  if (environment.storageGate) reasons.push('storage');
  const allowed = reasons.length === 0;
  const status = state.activeRun?.status;
  return {
    battleAllowed: allowed && status === 'combat',
    groundAllowed: allowed && status !== undefined && ['combat', 'wave-entry', 'travel', 'settlement', 'exit-wait'].includes(status),
    canRepeat: state.settings.autoRepeatEnabled && allowed && environment.settlementReady && environment.exitReady && status === 'settlement',
    blockedReasons: reasons,
  };
}
