import { describe, expect, it, vi } from 'vitest';
import type { DesignAction, DesignOperation, DryRunPlan } from '../contracts.ts';
import { planDryRun } from '../planner.ts';
import {
  airplaneOperation, candidate, environment, fiveProposalsOperation, htmlOperation,
  imageOperation, mediumOperation, reference, worldCoinOperation,
} from './fixtures.ts';

function planned(operation: DesignOperation): DryRunPlan {
  const result = planDryRun(operation, environment(operation));
  expect(result.errors).toEqual([]);
  expect(result.status).toBe('planned');
  expect(result.execution).toBe('dry_run');
  expect(result.actual_provider_calls).toBe(0);
  expect(result.live_execution_allowed).toBe(false);
  return result;
}

function blocked(result: DryRunPlan): void {
  expect(result.status).toBe('blocked');
  expect(result.errors.length).toBeGreaterThan(0);
  expect(result.calls).toEqual([]);
  expect(result.local_effects).toEqual([]);
  expect(result.actual_provider_calls).toBe(0);
  expect(result.live_execution_allowed).toBe(false);
}

describe('DAI-01 plans provider work without dispatching it', () => {
  it('never invokes fetch while planning authorized image and HTML requests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    try {
      planned(imageOperation());
      planned(htmlOperation());
      planned(fiveProposalsOperation());
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('HTML direct uses its model, carries the reference and generates no image', () => {
    const plan = planned(htmlOperation());
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({
      executor: 'html_model', route: 'chat_completions', model_profile: 'html_initial',
      model_id: 'gpt-5.4-mini', configuration_key: 'SLIDE_MODEL',
      reference_ids: ['layout'], image_outputs: 0,
    });
  });

  it('HTML refinement keeps its distinct configuration key', () => {
    const operation = htmlOperation();
    operation.action = 'edit_html';
    expect(planned(operation).calls[0]).toMatchObject({
      executor: 'html_model', model_profile: 'html_refinement',
      configuration_key: 'SLIDE_FIX_MODEL', image_outputs: 0,
    });
  });

  it('text-only image generation has one executor and creates a new asset', () => {
    const plan = planned(imageOperation());
    expect(plan.lineage).toBe('new_asset');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({
      executor: 'image_api', route: 'images_generations', model_profile: 'baseline',
      model_id: 'gpt-image-2', image_outputs: 1, reference_ids: [],
    });
  });

  it('world + coin + style retains input order and uses edits for a new asset', () => {
    const plan = planned(worldCoinOperation());
    expect(plan.lineage).toBe('new_asset');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({
      executor: 'image_api', route: 'images_edits',
      reference_ids: ['world', 'coin', 'style'], image_outputs: 1,
    });
    expect(plan.operation.context.references.map(item => item.roles)).toEqual([
      ['object_reference'], ['object_reference'], ['image_style_reference'],
    ]);
  });

  it('airplane generation freezes the target capture and placement region', () => {
    const operation = airplaneOperation();
    const plan = planned(operation);
    expect(plan.calls[0].route).toBe('images_edits');
    expect(plan.operation.context.placement).toEqual(operation.context.placement);
    operation.context.target.slide_id = 'slide-9';
    operation.context.references[0].version_id = 'capture-new';
    operation.context.placement!.region.x = 0;
    expect(plan.operation.context.target.slide_id).toBe('slide-2');
    expect(plan.operation.context.references[0].version_id).toBe('version-capture-1');
    expect(plan.operation.context.placement!.region.x).toBe(960);
  });

  it('editing an existing asset uses edits and creates a child version', () => {
    const operation = imageOperation();
    operation.action = 'edit_image';
    operation.context.base_asset = candidate();
    const plan = planned(operation);
    expect(plan.lineage).toBe('child_version');
    expect(plan.calls[0].route).toBe('images_edits');
  });

  it('exploration analysis plans conversation with zero image outputs', () => {
    const operation = htmlOperation();
    operation.action = 'analyze';
    operation.context.interaction_mode = 'explore_design';
    const plan = planned(operation);
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({ executor: 'responses', route: 'responses', image_outputs: 0 });
  });

  it('Responses image is a single alternative executor only when explicitly enabled', () => {
    const operation = worldCoinOperation();
    operation.image!.executor = 'responses_image';
    const disabled = environment(operation);
    blocked(planDryRun(operation, disabled));

    const enabled = { ...disabled, responses_image_enabled: true };
    const plan = planDryRun(operation, enabled);
    expect(plan.status).toBe('planned');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({ executor: 'responses_image', route: 'responses', image_outputs: 1 });
    expect(plan.calls.some(call => call.executor === 'image_api')).toBe(false);
  });
});

describe('proposals are outputs with independent identities', () => {
  it.each(['onboarding', 'presentations', 'free_design'] as const)(
    'the same planner supports five drafts in %s', workspace => {
      const operation = fiveProposalsOperation();
      operation.context.workspace = workspace;
      const plan = planned(operation);
      expect(plan.calls).toHaveLength(5);
      expect(plan.calls.reduce((total, call) => total + call.image_outputs, 0)).toBe(5);
      expect(plan.calls.map(call => call.candidate_id)).toEqual([
        'candidate-1', 'candidate-2', 'candidate-3', 'candidate-4', 'candidate-5',
      ]);
      expect(plan.calls.every(call => call.route === 'images_edits')).toBe(true);
    },
  );

  it('rejects five directions represented as fewer outputs', () => {
    const operation = fiveProposalsOperation();
    operation.image!.output_count = 1;
    blocked(planDryRun(operation, environment(operation)));
  });

  it('rejects duplicate candidate identities', () => {
    const operation = fiveProposalsOperation();
    operation.proposals![1].candidate_id = operation.proposals![0].candidate_id;
    blocked(planDryRun(operation, environment(operation)));
  });

  it('rejects indistinguishable prompts in the proposal set', () => {
    const operation = fiveProposalsOperation();
    operation.proposals![1].instruction = operation.proposals![0].instruction;
    blocked(planDryRun(operation, environment(operation)));
  });

  it('rejects a candidate referencing material outside the operation', () => {
    const operation = fiveProposalsOperation();
    operation.proposals![0].reference_ids.push('missing-reference');
    blocked(planDryRun(operation, environment(operation)));
  });

  it('combines selected directions into one new low draft without replacing them', () => {
    const operation = imageOperation();
    operation.action = 'combine_proposals';
    operation.context.interaction_mode = 'explore_design';
    operation.selected_candidates = [candidate('one'), candidate('three')];
    const original = structuredClone(operation.selected_candidates);
    const plan = planned(operation);
    expect(plan.lineage).toBe('new_asset');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].image_outputs).toBe(1);
    expect(plan.operation.selected_candidates).toEqual(original);
    expect(operation.selected_candidates).toEqual(original);
  });

  it('cannot combine only one selected candidate', () => {
    const operation = imageOperation();
    operation.action = 'combine_proposals';
    operation.selected_candidates = [candidate()];
    blocked(planDryRun(operation, environment(operation)));
  });
});

describe('direction approval is separate from authorizing another render', () => {
  it('approving direction stores a decision and plans no provider call', () => {
    const operation = htmlOperation();
    operation.action = 'approve_direction';
    operation.selected_candidates = [candidate()];
    const plan = planDryRun(operation, environment());
    expect(plan.status).toBe('planned');
    expect(plan.calls).toEqual([]);
    expect(plan.local_effects).toContain('record_direction');
  });

  it('approving a final result plans no render or implicit prompt publication', () => {
    const operation = htmlOperation();
    operation.action = 'approve_result';
    operation.selected_candidates = [candidate()];
    const plan = planDryRun(operation, environment());
    expect(plan.status).toBe('planned');
    expect(plan.calls).toEqual([]);
    expect(plan.local_effects.some(effect => /publish|master_prompt/.test(effect))).toBe(false);
  });

  it('explicit medium generation creates one reviewable child version', () => {
    const plan = planned(mediumOperation());
    expect(plan.lineage).toBe('child_version');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0]).toMatchObject({ route: 'images_edits', image_outputs: 1 });
    expect(plan.local_effects.some(effect => /approve_result|publish/.test(effect))).toBe(false);
  });

  it('direction approval alone does not authorize medium generation', () => {
    blocked(planDryRun(mediumOperation(), environment()));
  });

  it('rejects medium when the approved direction and selected base differ', () => {
    const operation = mediumOperation();
    operation.context.direction_approval!.candidate.version_id = 'another-version';
    blocked(planDryRun(operation, environment(operation)));
  });

  it('rejects medium after removing an approved immutable element', () => {
    const operation = mediumOperation();
    operation.context.immutable_elements.pop();
    blocked(planDryRun(operation, environment(operation)));
  });

  it('the explicit combined action records direction and plans exactly one render', () => {
    const operation = mediumOperation();
    operation.action = 'approve_and_generate_medium';
    delete operation.context.direction_approval;
    const plan = planned(operation);
    expect(plan.local_effects).toContain('record_direction');
    expect(plan.lineage).toBe('child_version');
    expect(plan.calls).toHaveLength(1);
    expect(plan.calls[0].image_outputs).toBe(1);
  });

  it('cannot smuggle image execution options into a local approval action', () => {
    const operation = mediumOperation();
    operation.action = 'approve_direction';
    blocked(planDryRun(operation, environment(operation)));
  });
});

describe('execution scope cannot drift after authorization', () => {
  it.each([
    ['base version', (op: DesignOperation) => { op.context.base_asset!.version_id = 'new-base'; }],
    ['quality', (op: DesignOperation) => { op.image!.quality = 'high'; }],
    ['target', (op: DesignOperation) => { op.context.target.slide_id = 'different-slide'; }],
    ['quantity', (op: DesignOperation) => { op.image!.output_count = 2; }],
    ['instruction', (op: DesignOperation) => { op.context.instruction = 'También cambia todo el texto.'; }],
  ] as const)('blocks a changed %s', (_label, mutate) => {
    const operation = mediumOperation();
    const authorized = environment(operation);
    mutate(operation);
    blocked(planDryRun(operation, authorized));
  });

  it('requires authorization for HTML work as well as image work', () => {
    blocked(planDryRun(htmlOperation(), environment()));
    blocked(planDryRun(imageOperation(), environment()));
  });

  it('rejects an authorization granted to a different actor', () => {
    const operation = imageOperation();
    const authorized = environment(operation);
    authorized.authorization!.actor_id = 'other-actor';
    blocked(planDryRun(operation, authorized));
  });

  it('cannot enable an unapproved profile merely by putting it in the request', () => {
    const operation = imageOperation();
    operation.image!.profile = 'sunburst_rescue';
    blocked(planDryRun(operation, environment(operation)));
  });
});

describe('references, targets and local reuse', () => {
  it.each(['edit_image', 'recreate_asset', 'extract_asset'] as DesignAction[])(
    '%s rejects a missing source version', action => {
      const operation = imageOperation();
      operation.action = action;
      if (action === 'extract_asset') delete operation.image;
      blocked(planDryRun(operation, environment(operation)));
    },
  );

  it.each(['mount_asset', 'extract_asset', 'compare_versions'] as DesignAction[])(
    '%s is local and requires no image generation', action => {
      const operation = htmlOperation();
      operation.action = action;
      operation.context.base_asset = candidate();
      const plan = planDryRun(operation, environment());
      expect(plan.status).toBe('planned');
      expect(plan.calls).toEqual([]);
      expect(plan.actual_provider_calls).toBe(0);
    },
  );

  it('blocks stale captures before planning an airplane', () => {
    const operation = airplaneOperation();
    operation.context.placement!.document_revision = 'revision-2';
    blocked(planDryRun(operation, environment(operation)));
  });

  it('blocks a placement region outside the captured canvas', () => {
    const operation = airplaneOperation();
    operation.context.placement!.region.x = 1900;
    blocked(planDryRun(operation, environment(operation)));
  });

  it('requires the capture reference to exist in the authorized operation', () => {
    const operation = airplaneOperation();
    operation.context.placement!.capture_reference_id = 'missing-capture';
    blocked(planDryRun(operation, environment(operation)));
  });

  it('blocks references from a different business', () => {
    const operation = worldCoinOperation();
    operation.context.references[1].business_id = 'business-b';
    blocked(planDryRun(operation, environment(operation)));
  });

  it('blocks a base version from a different business', () => {
    const operation = imageOperation();
    operation.action = 'edit_image';
    operation.context.base_asset = { ...candidate(), business_id: 'business-b' };
    blocked(planDryRun(operation, environment(operation)));
  });

  it('blocks selected candidates from a different business', () => {
    const operation = htmlOperation();
    operation.action = 'approve_direction';
    operation.selected_candidates = [{ ...candidate(), business_id: 'business-b' }];
    blocked(planDryRun(operation, environment()));
  });

  it('rejects transparent JPEG before a provider call is planned', () => {
    const operation = imageOperation();
    operation.image!.output_format = 'jpeg';
    blocked(planDryRun(operation, environment(operation)));
  });

  it('does not pretend that a PDF is directly an image reference', () => {
    const operation = imageOperation();
    const pdf = reference('brand-pdf', ['image_style_reference']);
    pdf.mime_type = 'application/pdf';
    operation.context.references = [pdf];
    blocked(planDryRun(operation, environment(operation)));
  });
});
