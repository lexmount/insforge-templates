import { describe, expect, it } from 'vitest';

import { functionErrorMessage } from '../src/lib/config';

describe('functionErrorMessage', () => {
  it('uses the Function message when the SDK exposes it', () => {
    expect(functionErrorMessage(
      { message: '该地址指向本地或内网。', error: 'private_base_url' },
      '保存失败。',
    )).toBe('该地址指向本地或内网。');
  });

  it('translates an SDK error code when its message is empty', () => {
    expect(functionErrorMessage(
      { message: '', error: 'private_base_url' },
      '保存失败。',
    )).toBe('该地址指向本地或内网，请填写公网 HTTPS 地址。');
  });

  it('uses the caller fallback for an unknown empty error', () => {
    expect(functionErrorMessage({ message: '', error: 'unknown' }, '保存失败。')).toBe('保存失败。');
  });
});
