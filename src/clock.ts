/** Fixed simulation ticks; a hidden page or long suspension never earns catch-up time. */
export class GameClock {
  private last: number | undefined;
  private remainder = 0;

  reset() {
    this.last = undefined;
    this.remainder = 0;
  }

  advance(now: number, paused: boolean, step: (seconds: number) => void) {
    if (paused) {
      this.reset();
      return;
    }
    if (this.last === undefined) {
      this.last = now;
      return;
    }
    const elapsed = now - this.last;
    this.last = now;
    if (elapsed < 0 || elapsed > 1000) {
      this.remainder = 0;
      return;
    }
    this.remainder += elapsed;
    while (this.remainder >= 50 - 1e-7) {
      this.remainder -= 50;
      step(0.05);
    }
  }
}
