import type {
  CandidateVersion,
  DesignContext,
  DesignOperation,
  DesignReference,
  ImageExecution,
  PlanningEnvironment,
} from '../contracts.ts';

/** Local metadata fixtures. No file resolver, credential or remote URL is used. */
export function reference(id: string, roles: DesignReference['roles']): DesignReference {
  return {
    reference_id: id,
    business_id: 'business-a',
    asset_id: `asset-${id}`,
    version_id: `version-${id}-1`,
    mime_type: 'image/png',
    roles,
  };
}

export function candidate(id = 'direction-1'): CandidateVersion {
  return {
    candidate_id: id,
    business_id: 'business-a',
    asset_id: `asset-${id}`,
    version_id: `version-${id}-low`,
  };
}

export function context(): DesignContext {
  return {
    actor_id: 'actor-a',
    business_id: 'business-a',
    brand_id: 'brand-a',
    project_id: 'project-a',
    session_id: 'session-a',
    workspace: 'presentations',
    interaction_mode: 'execute_change',
    target: {
      document_type: 'presentation',
      document_id: 'deck-a',
      revision: 'revision-3',
      slide_id: 'slide-2',
      element_id: 'hero',
    },
    instruction: 'Conserva el título aprobado y coloca la pieza en el espacio seleccionado.',
    immutable_elements: ['Título: Operaciones globales', 'Cifra: 45 días'],
    copy_version_id: 'copy-version-2',
    references: [],
  };
}

export function imageOptions(): ImageExecution {
  return {
    profile: 'baseline',
    quality: 'low',
    size: { width: 1024, height: 1024 },
    output_format: 'png',
    background: 'transparent',
    output_count: 1,
    executor: 'image_api',
  };
}

export function imageOperation(): DesignOperation {
  return {
    operation_key: 'operation-image-1',
    action: 'generate_image',
    context: context(),
    image: imageOptions(),
  };
}

export function htmlOperation(): DesignOperation {
  return {
    operation_key: 'operation-html-1',
    action: 'generate_html',
    context: {
      ...context(),
      references: [reference('layout', ['layout_reference'])],
    },
  };
}

export function airplaneOperation(): DesignOperation {
  const operation = imageOperation();
  operation.context.instruction = 'Crea un avión independiente que encaje en esta región.';
  operation.context.references = [reference('capture', ['placement_context', 'target_render'])];
  operation.context.placement = {
    capture_reference_id: 'capture',
    document_revision: 'revision-3',
    canvas: { width: 1920, height: 1080 },
    region: { x: 960, y: 120, width: 800, height: 800, units: 'px' },
  };
  return operation;
}

export function worldCoinOperation(): DesignOperation {
  const operation = imageOperation();
  operation.context.workspace = 'free_design';
  operation.context.target = {
    document_type: 'cover', document_id: 'cover-a', revision: 'revision-1',
  };
  operation.context.instruction = 'Combina el mundo y la moneda siguiendo la referencia de estilo.';
  operation.context.references = [
    reference('world', ['object_reference']),
    reference('coin', ['object_reference']),
    reference('style', ['image_style_reference']),
  ];
  return operation;
}

export function fiveProposalsOperation(): DesignOperation {
  const operation = worldCoinOperation();
  operation.operation_key = 'operation-proposals-1';
  operation.action = 'generate_proposals';
  operation.context.interaction_mode = 'explore_design';
  operation.image!.output_count = 5;
  operation.proposals = [
    'Mundo central y moneda en primer plano.',
    'Moneda en diagonal sobre una órbita del mundo.',
    'Composición editorial asimétrica con mundo a la derecha.',
    'Vista superior con moneda y mundo en equilibrio.',
    'Composición minimalista con objetos separados por espacio negativo.',
  ].map((instruction, index) => ({
    candidate_id: `candidate-${index + 1}`,
    instruction,
    reference_ids: ['world', 'coin', 'style'],
  }));
  return operation;
}

export function mediumOperation(): DesignOperation {
  const operation = imageOperation();
  const selected = candidate();
  operation.action = 'generate_medium';
  operation.image!.quality = 'medium';
  operation.context.interaction_mode = 'explore_design';
  operation.context.base_asset = {
    business_id: selected.business_id,
    asset_id: selected.asset_id,
    version_id: selected.version_id,
  };
  operation.context.direction_approval = {
    candidate: structuredClone(selected),
    immutable_elements: [...operation.context.immutable_elements],
  };
  operation.selected_candidates = [selected];
  return operation;
}

/** Simulates the trusted backend scope; never a real authorization or quota grant. */
export function environment(operation?: DesignOperation): PlanningEnvironment {
  return {
    actor_id: 'actor-a',
    business_id: 'business-a',
    enabled_image_profiles: ['baseline'],
    responses_image_enabled: false,
    ...(operation ? {
      authorization: {
        authorization_id: 'authorization-fixture',
        actor_id: 'actor-a',
        scope: structuredClone(operation),
      },
    } : {}),
  };
}
