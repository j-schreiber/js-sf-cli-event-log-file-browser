/**
 * Semaphore for controlling concurrent operations.
 * Limits the number of simultaneous async operations.
 */
export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  public constructor(private maxConcurrent: number) {}

  /**
   * Acquires a slot in the semaphore.
   * If the max concurrency is reached, waits until a slot is available.
   */
  public async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  /**
   * Releases a slot in the semaphore.
   * If there are waiting operations, the next one is started.
   */
  public release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}
