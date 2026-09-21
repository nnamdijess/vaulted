export type RepeatMode = 'off' | 'all' | 'one';

/** Session-only navigation. The saved project order is never shuffled or mutated. */
export class PlaybackOrder {
  ids: number[] = [];
  current: number | null = null;
  shuffle = false;
  repeat: RepeatMode = 'off';
  private history: number[] = [];
  private cursor = 0;
  private remaining: number[] = [];

  reset(ids: number[], current: number) {
    this.ids = [...ids]; this.current = current;
    this.history = [current]; this.cursor = 0; this.newCycle();
  }
  private newCycle(includeCurrent = false) {
    this.remaining = this.ids.filter(id => includeCurrent || id !== this.current);
    // Called only in response to playback actions, never during initial rendering.
    for (let i = this.remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
    }
    if (includeCurrent && this.remaining.length > 1 && this.remaining[0] === this.current) {
      [this.remaining[0], this.remaining[1]] = [this.remaining[1], this.remaining[0]];
    }
  }
  setShuffle(enabled: boolean) {
    this.shuffle = enabled;
    // Keep the actual listening history when changing modes. Only future choices reset.
    this.history = this.history.slice(0, this.cursor + 1); this.newCycle();
  }
  reconcile(ids: number[]) {
    this.ids = [...ids];
    const past = this.history.slice(0, this.cursor + 1).filter(id => ids.includes(id));
    this.history = [...past, ...this.history.slice(this.cursor + 1).filter(id => ids.includes(id))];
    this.cursor = Math.max(0, past.length - 1);
    this.remaining = this.remaining.filter(id => ids.includes(id));
  }
  get canPrevious() {
    return this.current !== null && (this.cursor > 0 || (!this.shuffle && this.ids.indexOf(this.current) > 0));
  }
  get canNext() {
    if (this.current === null || !this.ids.length) return false;
    if (this.repeat === 'all') return true;
    return this.shuffle ? this.cursor < this.history.length - 1 || this.remaining.length > 0 : this.ids.indexOf(this.current) < this.ids.length - 1;
  }
  previous(): number | null {
    if (!this.canPrevious) return null;
    if (this.cursor > 0) this.current = this.history[--this.cursor];
    else { this.current = this.ids[this.ids.indexOf(this.current!) - 1]; this.history = [this.current]; }
    return this.current;
  }
  next(): number | null {
    if (!this.canNext) return null;
    if (this.shuffle && this.cursor < this.history.length - 1) return this.current = this.history[++this.cursor];
    let next: number;
    if (this.shuffle) {
      if (!this.remaining.length) this.newCycle(true);
      next = this.remaining.shift() ?? this.current!;
    } else next = this.ids[(this.ids.indexOf(this.current!) + 1) % this.ids.length];
    this.history = [...this.history.slice(0, this.cursor + 1), next];
    // Bound session memory for long-running repeat playback.
    if (this.history.length > 500) this.history.shift();
    this.cursor = this.history.length - 1; this.current = next;
    return next;
  }
}
