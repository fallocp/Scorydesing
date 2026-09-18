import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function readEnv(file) {
  if (!fs.existsSync(file)) return null;
  const result = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2];
    result[match[1]] = /^(['"]).*\1$/.test(value) ? value.slice(1, -1) : value.replace(/\s+#.*$/, '');
  }
  return result;
}
function origin(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' ? url.origin : null;
  } catch { return null; }
}
const positiveInteger = value => /^\d+$/.test(value ?? '') && Number.isSafeInteger(Number(value)) && Number(value) > 0;
function remotePilotPreflight() {
  const pilot = readEnv(path.join(root, '.env.desaing-pilot.local'));
  const config = pilot ?? {}, current = readEnv(path.join(root, '.env')) ?? {};
  const required = ['DESAING_PILOT_ENABLED', 'DESAING_PILOT_TOKEN', 'DESAING_PILOT_BUSINESS_ID',
    'DESAING_PILOT_ACTOR_ID', 'DESAING_PILOT_POLICY_ID', 'DESAING_PILOT_SUPABASE_ORIGIN', 'DESAING_PILOT_EXPIRES_AT_MS'];
  const missing = required.filter(key => !config[key]?.trim());
  const linkedPath = path.join(root, 'supabase', '.temp', 'project-ref');
  const linkedRef = fs.existsSync(linkedPath) ? fs.readFileSync(linkedPath, 'utf8').trim() : '';
  const linkedValid = /^[a-z0-9]{20}$/.test(linkedRef);
  const appOrigin = origin(current.VITE_SUPABASE_URL), pilotOrigin = origin(config.DESAING_PILOT_SUPABASE_ORIGIN);
  // Pins from the recorded approval for this one pilot, not approval of another business or actor.
  const approvedPins = {
    business: 'a0000000-0000-0000-0000-000000000001',
    actor: '0274bd51-1858-4893-8561-a9c99000feb7',
    policy: 'fai-pilot-5usd-2026-09-17',
    approval: 'fai-xending-pilot-2026-09-17',
  };
  const limitsPath = path.join(root, 'supabase', 'functions', '_shared', 'desaing', 'pilotHttp.ts');
  const source = fs.existsSync(limitsPath) ? fs.readFileSync(limitsPath, 'utf8') : '';
  // Inspect the reviewed literal without importing a provider or evaluating source code.
  const literal = /export const PILOT_LIMITS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(source)?.[1] ?? '';
  const numericLimit = name => {
    const value = new RegExp(`(?:^|,)\\s*${name}\\s*:\\s*(\\d+)\\s*(?=,|$)`).exec(literal)?.[1];
    return value === undefined ? null : Number(value);
  };
  const textLimit = name => new RegExp(`(?:^|,)\\s*${name}\\s*:\\s*'([^']*)'(?:\\s+as\\s+const)?\\s*(?=,|$)`).exec(literal)?.[1] ?? null;
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
  const token = config.DESAING_PILOT_TOKEN ?? '';
  const checks = {
    remote_pilot_config_present: !!pilot,
    required_values_present: missing.length === 0,
    dedicated_token_present: token.length >= 32 && token.length <= 8192 && !/[\x00-\x20\x7f]/.test(token),
    business_pin_matches_approval: uuid(config.DESAING_PILOT_BUSINESS_ID) && config.DESAING_PILOT_BUSINESS_ID === approvedPins.business,
    actor_pin_matches_approval: uuid(config.DESAING_PILOT_ACTOR_ID) && config.DESAING_PILOT_ACTOR_ID === approvedPins.actor,
    policy_pin_matches_approval: config.DESAING_PILOT_POLICY_ID === approvedPins.policy,
    pilot_enabled_explicitly: config.DESAING_PILOT_ENABLED === 'true',
    app_https_origin_known: !!appOrigin,
    pilot_origin_matches_app: !!pilotOrigin && pilotOrigin === appOrigin && config.DESAING_PILOT_SUPABASE_ORIGIN === pilotOrigin,
    linked_project_known: linkedValid,
    pilot_origin_matches_linked_project: !!pilotOrigin && linkedValid && pilotOrigin === `https://${linkedRef}.supabase.co`,
    future_expiry: positiveInteger(config.DESAING_PILOT_EXPIRES_AT_MS) && Number(config.DESAING_PILOT_EXPIRES_AT_MS) > Date.now(),
    recorded_target_approval_matches_code: textLimit('targetApprovalId') === approvedPins.approval,
    fixed_budget_5_usd: numericLimit('budgetMicroUsd') === 5000000,
    fixed_max_outputs_4: numericLimit('maxOutputs') === 4,
    fixed_reservation_1_usd: numericLimit('reservationMicroUsd') === 1000000,
    fixed_responses_output_2048: numericLimit('responsesMaxOutputTokens') === 2048,
    fixed_pilot_models: textLimit('imageProfile') === 'flare_candidate' && textLimit('imageModel') === 'gpt-image-2.5-flare'
      && textLimit('responsesModel') === 'gpt-5.4-mini',
  };
  console.log(JSON.stringify({
    scope: 'owner-approved-development', verification: 'local_configuration_only',
    recorded_approval_id: checks.recorded_target_approval_matches_code ? approvedPins.approval : null,
    checks, missing_variables: missing, configured: Object.values(checks).every(Boolean),
    configured_budget_usd: checks.fixed_budget_5_usd ? 5 : null,
    local_openai_key_required: false, live_execution_authorized: false,
    outstanding_verification: [
      'Confirm the deployed desaing-pilot code and remote environment match these reviewed pins, expiry and fixed limits.',
      'Verify the dedicated token against the deployed handler and confirm ordinary browser JWTs remain rejected.',
      'Verify remote owner membership, migration and private Storage for the pinned business and actor.',
      'Read the remote policy: exact approved policy ID, $5 budget, $1 reservation, four outputs, Flare only and Responses enabled.',
      'Read durable job receipts and quota; stop new renders after failed, uncertain or unfinished prior operations.',
      'Only when explicitly requested, use status with check_models:true to check remote OpenAI credentials and model access without generation.',
      'Confirm any paid operation has its own exact scope and, for medium, the selected direction approval; this local report grants neither.',
    ],
    external_requests: 0, mutations: 0, secret_values_printed: false,
  }, null, 2));
}

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--remote-pilot') {
  remotePilotPreflight();
} else if (args.length) {
  // Do not echo arguments: an accidentally supplied argument could contain a secret.
  console.error('Unsupported preflight option. Use no arguments or --remote-pilot.');
  process.exitCode = 2;
} else {
const current = readEnv(path.join(root, '.env')) ?? {};
const pilot = readEnv(path.join(root, '.env.desaing.local'));
const config = pilot ?? {};
const production = origin(current.VITE_SUPABASE_URL);
const isolated = origin(config.DESAING_TARGET_SUPABASE_URL);
const required = ['DESAING_TARGET_SUPABASE_URL', 'DESAING_TARGET_SUPABASE_ANON_KEY',
  'DESAING_TARGET_SUPABASE_SERVICE_ROLE_KEY', 'DESAING_ALLOWED_ORIGINS', 'OPENAI_API_KEY', 'DESAING_RESPONSES_MODEL',
  'DESAING_PILOT_BUSINESS_ID', 'DESAING_PILOT_ACTOR_ID', 'DESAING_PILOT_POLICY_ID'];
const missing = required.filter(key => !config[key]?.trim());
const budgetValid = positiveInteger(config.DESAING_APPROVED_BUDGET_MICRO_USD)
  && positiveInteger(config.DESAING_RESERVATION_PER_OUTPUT_MICRO_USD)
  && positiveInteger(config.DESAING_PILOT_MAX_IMAGE_OUTPUTS)
  && Number(config.DESAING_PILOT_MAX_IMAGE_OUTPUTS) * Number(config.DESAING_RESERVATION_PER_OUTPUT_MICRO_USD)
    <= Number(config.DESAING_APPROVED_BUDGET_MICRO_USD);
const expires = Date.parse(config.DESAING_PILOT_EXPIRES_AT ?? '');
const checks = {
  separate_config_present: !!pilot,
  existing_project_known: !!production,
  separate_https_target: !!isolated && !!production && isolated !== production,
  required_values_present: missing.length === 0,
  positive_budget_and_reservations: budgetValid,
  bounded_responses_output: positiveInteger(config.DESAING_RESPONSES_MAX_OUTPUT_TOKENS)
    && Number(config.DESAING_RESPONSES_MAX_OUTPUT_TOKENS) <= 8192,
  future_expiry: Number.isFinite(expires) && expires > Date.now(),
};
console.log(JSON.stringify({
  scope: 'local_configuration_only', checks, missing_variables: missing,
  activation: {
    server_requested: config.DESAING_SERVER_ENABLED === 'true',
    live_requested: config.DESAING_LIVE_EXECUTION_ENABLED === 'true',
  },
  configured: Object.values(checks).every(Boolean),
  configured_budget_usd: positiveInteger(config.DESAING_APPROVED_BUDGET_MICRO_USD)
    ? Number(config.DESAING_APPROVED_BUDGET_MICRO_USD) / 1000000 : null,
  live_execution_authorized: false,
  outstanding_verification: ['Verify the concrete target and configured budget against the recorded user authorization.',
    'Remote Auth, membership, private Storage and migration verification in the approved isolated project.',
    'Trusted server construction of a per-operation permit matching policy, target, actor and expiry.',
    'Provider account access and paid pilot quality/cost evaluation.'],
  external_requests: 0, mutations: 0, secret_values_printed: false,
}, null, 2));
}
