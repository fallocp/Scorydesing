import { describe, expect, it } from 'vitest';
import { beginExploration, createExplorationSession, discardUnsubmittedExploration, finishExploration, markExplorationUncertain } from '../exploration.ts';
import { context, request, result } from './fixtures/explorationFixture.ts';

describe('discarding an explicitly refused, unsubmitted text request', () => {
  it.each(['running', 'uncertain'] as const)('removes only the refused %s attempt and keeps completed ideas and conversation', status => {
    const completed = finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), request()), result());
    let pending = beginExploration(completed, request('refused'));
    if (status === 'uncertain') pending = markExplorationUncertain(pending, 'refused');
    const recovered = discardUnsubmittedExploration(pending, 'refused');
    expect(recovered.attempts).toEqual(completed.attempts); expect(recovered.messages).toEqual(completed.messages);
    expect(recovered.sets).toEqual(completed.sets); expect(recovered.context).toEqual(completed.context);
    expect(recovered.revision).toBe(pending.revision + 1); expect(pending.attempts).toHaveLength(2);
    expect(() => beginExploration(recovered, request('new-explicit-request'))).not.toThrow();
  });
  it('never discards a completed request, missing request or its persisted result', () => {
    const completed = finishExploration(beginExploration(createExplorationSession(context(), 'asset_in_region'), request()), result());
    expect(() => discardUnsubmittedExploration(completed, 'request-1')).toThrow('exploration_request_not_discardable');
    expect(() => discardUnsubmittedExploration(completed, 'missing')).toThrow('exploration_request_not_discardable');
    expect(completed.sets).toHaveLength(1); expect(completed.attempts[0].result).toEqual(result());
  });
});
