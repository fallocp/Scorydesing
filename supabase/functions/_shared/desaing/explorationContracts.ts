import type { AssetVersion, DesignContext, ReferenceRole } from './contracts.ts';
import type { ServerExplorationCapabilities } from './serverExplorationContract.ts';
import type { ConversationNextAction, ConversationTurnContext } from './conversationActions.ts';

/** Textual ideas are not image candidates, approvals or AssetVersions. */
export type ExplorationScope = 'asset_in_region' | 'full_design';
export type IdeaAspect = 'subject' | 'composition' | 'style' | 'palette';
export interface IdeaContent {
  title: string;
  rationale: string;
  aspects: Record<IdeaAspect, string>;
  render_instruction: string;
  reference_ids: string[];
}
export interface IdeaSelection { set_id: string; idea_id: string; version: number }
export interface IdeaSource extends IdeaSelection { aspects: IdeaAspect[] }
export interface TextIdea extends IdeaContent {
  idea_id: string;
  version: number;
  sources: IdeaSource[];
  feedback: string[];
}
export interface ExplorationUsage { input_tokens: number; output_tokens: number; total_tokens: number }
export interface TextIdeaSet {
  set_id: string;
  request_key: string;
  context: DesignContext;
  scope: ExplorationScope;
  ideas: TextIdea[];
  response_id: string | null;
  usage: ExplorationUsage | null;
}
export interface ExplorationMessage { role: 'user' | 'assistant'; text: string; request_key: string }
/** Literal copy is resolved content, not an approval or permission to render. */
export interface DesignCopy {
  status: 'pending' | 'literal' | 'none';
  text: string;
  source_reference_ids: string[];
}
export interface ExplorationBrandSnapshot {
  brand_id: string;
  name: string;
  summary: string;
  palette: string[];
  typography: string[];
}
export interface DesignUnderstanding {
  intent: 'recreate' | 'variation' | 'explore';
  resolved_instruction: string;
  copy: DesignCopy;
  references: { reference_id: string; roles: ReferenceRole[]; instruction: string }[];
  preserve: string[];
  pending_questions: string[];
}
export interface ExplorationDesignBrief {
  copy: DesignCopy;
  brand: ExplorationBrandSnapshot | null;
  selected_instruction: string;
  preserve: string[];
  previous_understanding?: DesignUnderstanding;
}
export interface ExplorationRequest {
  request_key: string;
  kind: 'directions' | 'discussion';
  scope: ExplorationScope;
  context: DesignContext;
  message: string;
  history: Pick<ExplorationMessage, 'role' | 'text'>[];
  design_brief?: ExplorationDesignBrief;
  /** Opt-in unified conversation; execution remains a separate authorized step. */
  conversation?: ConversationTurnContext;
}
export interface ExplorationResult {
  request_key: string;
  message: string;
  ideas: IdeaContent[];
  response_id: string | null;
  usage: ExplorationUsage | null;
  design_understanding?: DesignUnderstanding;
  next_action?: ConversationNextAction;
}
export interface ExplorationAttempt {
  request: ExplorationRequest;
  status: 'running' | 'completed' | 'uncertain';
  result?: ExplorationResult;
}
export interface ExplorationRenderBinding {
  selection: IdeaSelection;
  operation_key: string;
  asset?: AssetVersion;
}
export interface ExplorationSession {
  schema_version: 1;
  revision: number;
  context: DesignContext;
  scope: ExplorationScope;
  messages: ExplorationMessage[];
  sets: TextIdeaSet[];
  attempts: ExplorationAttempt[];
  selected: IdeaSelection | null;
  render_bindings: ExplorationRenderBinding[];
}
/** Provider-independent port. Live use goes through authenticated server admission. */
export interface ExplorationPlanner {
  plan(request: ExplorationRequest): Promise<ExplorationResult>;
  /** Read a previously persisted result; must never dispatch or retry a plan. */
  recover?(requestKey: string, request?: ExplorationRequest): Promise<ExplorationResult | null>;
  /** Own durable requests/results only; captures and local idea edits are not uploaded. */
  history?(sessionId: string): Promise<ExplorationAttempt[]>;
  capabilities?(): Promise<ServerExplorationCapabilities | null>;
}
