import { describe, expect, it, vi } from 'vitest';
import { resolvePromptGovernance } from '../promptGovernance';

describe('governance fallback preserves legacy business scope', () => {
  it('keeps authenticated non-governed legacy writes available when the experimental API is missing or unavailable', async () => {
    const fallback = vi.fn(async () => ({ governed: false, can_manage: false }));
    expect(await resolvePromptGovernance(undefined, fallback)).toEqual({ governed: false, can_manage: false });
    for (const error of [{ code: 'route_not_found', httpStatus: 404 }, { code: 'server_disabled', httpStatus: 503 }, { code: 'server_response_unknown', httpStatus: null }]) {
      expect(await resolvePromptGovernance(async () => { throw error; }, fallback)).toEqual({ governed: false, can_manage: false });
    }
    expect(fallback).toHaveBeenCalledTimes(4);
  });
  it('does not turn unavailable management into permission and closes when both sources fail', async () => {
    const unavailable = async () => { throw { code: 'server_disabled', httpStatus: 503 }; };
    expect(await resolvePromptGovernance(unavailable, async () => ({ governed: true, can_manage: false }))).toEqual({ governed: true, can_manage: false });
    await expect(resolvePromptGovernance(unavailable, async () => { throw Error('RPC unavailable'); })).rejects.toThrow('RPC unavailable');
  });
  it('never falls back across authentication, membership or account-change refusals', async () => {
    const fallback = vi.fn(async () => ({ governed: false, can_manage: false }));
    for (const error of [{ code: 'server_session_changed', httpStatus: null }, { code: 'server_session_unavailable', httpStatus: null },
      { code: 'prompt_admin_forbidden', httpStatus: 403 }, { code: 'server_authentication_required', httpStatus: 401 }]) {
      await expect(resolvePromptGovernance(async () => { throw error; }, fallback)).rejects.toBe(error);
    }
    expect(fallback).not.toHaveBeenCalled();
  });
});
