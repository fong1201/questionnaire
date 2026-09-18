import { MicroCache } from './micro-cache.js';

describe('MicroCache', () => {
  it('coalesces concurrent loads and expires after the TTL', async () => {
    let time = 0;
    const cache = new MicroCache(2000, () => time);
    const load = vi.fn().mockResolvedValue('value');

    await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);
    expect(load).toHaveBeenCalledTimes(1);

    time = 2001;
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache failures', async () => {
    const cache = new MicroCache(2000, () => 0);
    await expect(cache.get('k', () => Promise.reject(new Error('db down')))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    await expect(cache.get('k', () => Promise.resolve('ok'))).resolves.toBe('ok');
  });
});
