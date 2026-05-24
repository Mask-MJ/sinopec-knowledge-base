import { describe, expect, it } from 'vitest';

import { ApiError } from '@/utils/request';

import { useFormLoading } from './useFormLoading';

describe('useFormLoading', () => {
  it('toggles loading true→false around the async fn', async () => {
    const { loading, withLoading } = useFormLoading();
    expect(loading.value).toBe(false);

    let observed = false;
    await withLoading(async () => {
      observed = loading.value;
    });

    expect(observed).toBe(true);
    expect(loading.value).toBe(false);
  });

  it('returns the inner fn result on success', async () => {
    const { withLoading } = useFormLoading();
    const result = await withLoading(async () => 42);
    expect(result).toBe(42);
  });

  it('swallows ApiError (interceptor already toasted) and returns undefined', async () => {
    const { loading, withLoading } = useFormLoading();
    const result = await withLoading(async () => {
      throw new ApiError('already shown');
    });
    expect(result).toBeUndefined();
    expect(loading.value).toBe(false);
  });

  it('rethrows non-ApiError so caller sees real bugs', async () => {
    const { loading, withLoading } = useFormLoading();
    await expect(
      withLoading(async () => {
        throw new TypeError('boom');
      }),
    ).rejects.toThrow('boom');
    expect(loading.value).toBe(false);
  });
});
