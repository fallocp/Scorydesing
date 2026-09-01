/**
 * generate-carousel-plan — el paso que decide la historia.
 *
 * Va antes de `generate-carousel-script` y le quita a ese agente la decisión
 * estructural, porque cuando la historia y el texto se decidían en la misma llamada el
 * modelo resolvía la redacción —que es lo que se le pedía— y la estructura le salía por
 * defecto.
 *
 * La primera corrida real mostró que separar los pasos no bastaba: había que dejar de
 * pasarle los briefs por rol del agente de guion, que describen QUÉ MOSTRAR y no qué
 * trabajo hace el beat. Ahora los briefs los pone esta función desde
 * `PLANNER_BEAT_JOBS`, no el llamador, para que un cliente no pueda volver a mandar los
 * prescriptivos por accidente.
 *
 * Nada se renderiza aquí. La validación, la crítica y las reparaciones ocurren sobre
 * texto, que es donde salen baratas y donde son confiables.
 *
 * Auth: JWT obligatorio y membresía validada antes de leer datos del tenant, igual que
 * `generate-carousel-script`.
 */

import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

import { callOpenAI } from '../_shared/callOpenAI.ts';
import { fetchBusinessContext } from '../_shared/fetchBusinessContext.ts';
import { getCopyKit } from '../_shared/copyKitRegistry.ts';
import { resolveKitSlug } from '../_shared/branchSlug.ts';
import { getSceneKit } from '../_shared/sceneKitRegistry.ts';
import { parseModelJson } from '../_shared/parseModelJson.ts';
import { rankRoutesByNovelty, resolveCompatibleRoutes } from '../_shared/carouselStoryRegistry.ts';
import {
  applyForwardFigureSchema,
  beatJobForRole,
  buildCarouselPlanPrompt,
  digestPlan,
  normalizeCreativePlan,
  toCarouselLanguageStyle,
} from '../_shared/buildCarouselCreativePlan.ts';
import {
  blockingIssues,
  validateCarouselCreativePlan,
} from '../_shared/validateCarouselCreativePlan.ts';
import {
  applyPlanRepairs,
  buildPlanCriticPrompt,
  hasUnrepairableIssue,
  MAX_PREFLIGHT_REPAIRS,
  parseCriticRepairs,
  unrepairableCodes,
} from '../_shared/repairCarouselCreativePlan.ts';
import type {
  AppliedRepair,
  CarouselCommercialIntent,
  CarouselCreativePlan,
  CarouselLanguageStyle,
  CarouselPlanContext,
  CarouselPlanDigest,
  CarouselPlanMedium,
  CarouselPlanObjective,
  CarouselPlanPreflight,
  DiversityMode,
  PresetBeatCoupling,
  PresetClosingPolicy,
  PresetLayoutPolicy,
  RepairRound,
} from '../_shared/carousel-plan-types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GenerateCarouselPlanRequest {
  business_id: string;
  branch_id?: string | null;
  vertical_id?: string | null;

  seedCopy: { headline: string; body?: string };
  /**
   * Solo los roles, en orden de lectura.
   *
   * El trabajo narrativo de cada uno lo resuelve esta función. La versión anterior lo
   * aceptaba del cliente como `brief`, y el cliente mandaba los briefs del agente de
   * guion —"la escena repite: varias compras, varios documentos"— que son los que
   * hicieron converger tres historias distintas en los mismos beats.
   */
  roles: string[];
  presetSlug: string;

  /** Cómo se lee el set. Lo declara el preset. */
  beatCoupling?: PresetBeatCoupling;
  layoutPolicy?: PresetLayoutPolicy;
  closingPolicy?: PresetClosingPolicy;

  objective?: CarouselPlanObjective;
  imageType?: CarouselPlanMedium;
  commercialIntent?: CarouselCommercialIntent;
  angleName?: string | null;
  industryName?: string | null;
  industrySlug?: string | null;

  /**
   * Huellas de los planes recientes de esta rama.
   *
   * No eliminan rutas, las degradan en el orden. Eliminarlas produce el caso en que
   * todas las rutas están usadas y el set no se puede generar.
   */
  recentFingerprints?: string[];
  recentRouteIds?: string[];
  /** Rutas fuera. Es cómo se piden tres planes distintos para el mismo copy. */
  excludeRouteIds?: string[];

  /**
   * Resúmenes de las historias que este plan no puede repetir.
   *
   * El mecanismo que faltaba: el preflight validaba cada plan contra sí mismo y nunca
   * contra otro, así que dos historias casi idénticas pasaban las dos aprobadas.
   */
  priorPlanDigests?: CarouselPlanDigest[];
  /** 'comparison' bloquea por parecido; 'production' solo lo reporta. */
  diversityMode?: DiversityMode;

  /** Si el agente puede inventar una ruta. Por defecto sí. */
  allowAgentProposedRoute?: boolean;

  /**
   * Dirección de la operación forward: 'import' (debes USD) o 'export' (te pagan USD).
   * Solo relevante en coberturas/forward; decide la escena fija que pone el schema.
   */
  forwardDirection?: 'import' | 'export';

  guidance?: string;
}

interface GenerateCarouselPlanResponse {
  plan: CarouselCreativePlan;
  preflight: CarouselPlanPreflight;
  /** Resumen del plan, para mandarlo como `priorPlanDigests` en la siguiente llamada. */
  digest: CarouselPlanDigest;
  /** Alternativas que también servían, para poder ofrecer otra historia. */
  candidateRoutes: { id: string; title: string; premise: string; storyQuestion: string }[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'auth_error', message: 'Missing or invalid Authorization header' },
        401,
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: 'auth_error', message: 'Invalid or expired token' }, 401);
    }

    let body: GenerateCarouselPlanRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'parse_error', message: 'Invalid request body' }, 400);
    }

    if (!body.business_id) {
      return jsonResponse({ error: 'parse_error', message: 'Missing business_id' }, 400);
    }
    if (!body.seedCopy?.headline?.trim()) {
      return jsonResponse({ error: 'parse_error', message: 'Missing seedCopy.headline' }, 400);
    }
    if (!Array.isArray(body.roles) || body.roles.length === 0) {
      return jsonResponse({ error: 'parse_error', message: 'Missing roles' }, 400);
    }
    if (!body.presetSlug?.trim()) {
      return jsonResponse({ error: 'parse_error', message: 'Missing presetSlug' }, 400);
    }

    const { data: membership } = await userClient
      .from('user_business_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', body.business_id)
      .maybeSingle();

    if (!membership) {
      return jsonResponse({ error: 'forbidden', message: 'Access denied' }, 403);
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    let businessCtx;
    try {
      businessCtx = await fetchBusinessContext(serviceClient, body.business_id);
    } catch (err) {
      console.error('fetchBusinessContext error:', err);
      return jsonResponse({ error: 'not_found', message: 'Business tenant not found' }, 404);
    }

    // --- Rama ---------------------------------------------------------------

    /**
     * El plan no puede existir sin rama.
     *
     * A diferencia del agente de guion, que degrada a `prompt_kit` cuando la rama no
     * tiene kit, aquí no hay a qué degradar: las rutas, la política de cifras y la
     * utilería prohibida son todas por rama. Un plan sin rama resuelta sería un plan sin
     * límites, que es exactamente lo que este paso vino a poner.
     */
    let branchName = '';
    let branchSlugRaw = '';
    if (body.branch_id) {
      const { data: branch } = await serviceClient
        .from('commercial_branches')
        .select('name, slug')
        .eq('id', body.branch_id)
        .eq('business_id', body.business_id)
        .maybeSingle();
      if (branch) {
        branchName = branch.name ?? '';
        branchSlugRaw = branch.slug ?? branch.name ?? '';
      }
    }

    const branchSlug = branchSlugRaw ? resolveKitSlug(branchSlugRaw) : null;
    if (!branchSlug) {
      return jsonResponse(
        {
          error: 'unsupported_branch',
          message:
            'Esta rama no tiene kit editorial ni repertorio visual, así que no hay rutas narrativas que ofrecerle. Genera el carrusel con el flujo anterior o dale kit a la rama.',
        },
        422,
      );
    }

    let copyKitVersion = 'unknown';
    let bannedPhrases: string[] = [];
    let languageStyle: CarouselLanguageStyle | null = null;
    try {
      const { kit } = await getCopyKit(branchSlugRaw, serviceClient, body.business_id);
      copyKitVersion = kit.kit_version ?? 'unknown';
      bannedPhrases = [...(kit.banned_phrases ?? [])];
      languageStyle = toCarouselLanguageStyle(kit.language_style);
    } catch (err) {
      console.warn('No se pudo resolver el copy kit:', err);
    }

    /*
     * Los términos de compliance entran junto a los ángulos prohibidos del kit.
     *
     * Son de naturalezas distintas —unos son legales y otros editoriales— pero para el
     * validador hacen lo mismo: si aparecen en el storyboard, la pieza no se publica.
     */
    bannedPhrases.push(...(businessCtx.complianceRules?.forbidden_terms ?? []));

    const sceneKit = getSceneKit(branchSlugRaw);

    const objective: CarouselPlanObjective = body.objective ?? 'conectar';
    const medium: CarouselPlanMedium = body.imageType ?? 'foto';

    // --- Rutas --------------------------------------------------------------

    /*
     * Los modos de profundizar ya usados salen del catálogo ANTES de generar.
     *
     * La validación de diversidad ya rechazaba una historia por profundizar igual que
     * otra, pero sobre el plan terminado: una llamada al modelo completa, tirada. Pasó de
     * verdad — dos rutas de velocidad compartían `time_pressure` y la segunda historia se
     * generó entera para ser rechazada en cero rondas.
     *
     * Solo en modo comparación: en producción, parecerse a algo publicado hace meses no
     * es motivo para quitar una ruta del catálogo.
     */
    const diversityMode: DiversityMode = body.diversityMode ?? 'production';
    const usedDeepeningModes =
      diversityMode === 'comparison'
        ? [...new Set((body.priorPlanDigests ?? []).map((d) => d.deepeningMode))]
        : [];

    const compatible = resolveCompatibleRoutes({
      branchSlug,
      angleTag: body.angleName ?? null,
      commercialIntent: body.commercialIntent ?? null,
      objective,
      presetSlug: body.presetSlug,
      slideCount: body.roles.length,
      excludeRouteIds: body.excludeRouteIds,
      excludeDeepeningModes: usedDeepeningModes,
    });

    const candidateRoutes = rankRoutesByNovelty(compatible, body.recentRouteIds ?? []);

    if (candidateRoutes.length === 0 && body.allowAgentProposedRoute === false) {
      return jsonResponse(
        {
          error: 'no_routes',
          message:
            'Ninguna ruta del registro aplica a esta combinación y las rutas propuestas están deshabilitadas.',
        },
        422,
      );
    }

    const ctx: CarouselPlanContext = {
      branchSlug,
      branchName: branchName || sceneKit?.branchName || branchSlug,
      angleTag: body.angleName ?? null,
      industrySlug: body.industrySlug ?? null,
      industryName: body.industryName ?? null,
      objective,
      commercialIntent: body.commercialIntent,
      presetSlug: body.presetSlug,
      medium,
      // El trabajo del beat lo pone esta función, no el cliente.
      slides: body.roles.map((role) => ({ role, narrativeJob: beatJobForRole(role) })),
      beatCoupling: body.beatCoupling ?? 'chained',
      layoutPolicy: body.layoutPolicy ?? 'varied',
      closingPolicy: body.closingPolicy ?? 'cta',
      sceneKit,
      copyKitVersion,
      bannedPhrases,
      languageStyle,
      candidateRoutes,
      recentFingerprints: body.recentFingerprints ?? [],
      priorPlanDigests: body.priorPlanDigests ?? [],
      diversityMode,
      allowAgentProposedRoute: body.allowAgentProposedRoute !== false,
    };

    // --- Plan ---------------------------------------------------------------

    const { systemMessage, userMessage } = buildCarouselPlanPrompt({
      ...ctx,
      seedHeadline: body.seedCopy.headline,
      seedBody: body.seedCopy.body,
      guidance: body.guidance,
    });

    const planResult = await callOpenAI({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      /*
       * El storyboard creció: son diecinueve campos por beat, contando los cinco de
       * composición, y el modelo razona antes de escribirlos. Una respuesta truncada es
       * impasteable y se pierde la llamada completa, así que el margen sale más barato
       * que el reintento.
       */
      max_completion_tokens: 9000,
      temperature: 0.9,
      timeoutMs: 120_000,
    });

    if (!planResult.success) {
      return jsonResponse(
        {
          error: planResult.error,
          message: planResult.message,
          retryAfter: planResult.retryAfter,
        },
        planResult.status || 500,
      );
    }

    const parsedPlan = parseModelJson<Record<string, unknown>>(planResult.content);
    if (!parsedPlan.ok || !parsedPlan.data) {
      console.error(
        `No se pudo parsear el plan (${parsedPlan.detail}). Final del contenido:`,
        planResult.content.slice(-500),
      );
      return jsonResponse(
        {
          error: 'parse_error',
          message: `El modelo no devolvió un plan válido: ${parsedPlan.detail || 'JSON inválido'}. Reintenta.`,
        },
        500,
      );
    }

    const { plan: initialPlan, droppedFigureScenarios } = normalizeCreativePlan(
      parsedPlan.data,
      ctx,
    );

    // --- Preflight ----------------------------------------------------------

    /*
     * Forward: el código fija qué cifras lleva cada slide según su rol, en vez de dejarlo
     * al LLM (que inventaba). Se aplica antes del preflight para que la validación vea la
     * estructura definitiva.
     */
    let plan = applyForwardFigureSchema(
      initialPlan,
      body.forwardDirection === 'export' ? 'export' : 'import',
    );
    let validation = validateCarouselCreativePlan(plan, ctx);
    const appliedRepairs: AppliedRepair[] = [];
    const repairHistory: RepairRound[] = [];

    /*
     * Reparar solo lo que bloquea, y solo lo que se puede reparar.
     *
     * Los `advisory` se reportan y no se tocan: un incumplimiento objetivo tiene una
     * sola respuesta correcta, una preferencia creativa no.
     *
     * Y hay fallos que ninguna operación cierra. `same_deepening_mode` significa que
     * esta ruta profundiza igual que otra ya contada, y eso lo declara el registro:
     * parchear takeaways gasta las dos rondas y el validador vuelve a encontrarlo. En
     * ese caso no se llama al crítico.
     */
    while (
      !validation.ok &&
      repairHistory.length < MAX_PREFLIGHT_REPAIRS &&
      !hasUnrepairableIssue(validation.issues)
    ) {
      const round = repairHistory.length + 1;
      const blocking = blockingIssues(validation.issues);
      const issuesBefore = blocking.map((i) => i.code);

      const critic = buildPlanCriticPrompt(plan, ctx, blocking);
      const criticResult = await callOpenAI({
        messages: [
          { role: 'system', content: critic.systemMessage },
          { role: 'user', content: critic.userMessage },
        ],
        max_completion_tokens: 5000,
        temperature: 0.4,
        timeoutMs: 90_000,
      });

      if (!criticResult.success) {
        console.warn('El crítico falló, se conserva el plan y sus fallos:', criticResult.message);
        repairHistory.push({
          round,
          issuesBefore,
          requested: [],
          rejected: [{ type: 'llamada', reason: criticResult.message }],
          applied: [],
          issuesAfter: issuesBefore,
          verdict: 'critic_unavailable',
          note: criticResult.message,
        });
        break;
      }

      const parsedCritic = parseModelJson<Record<string, unknown>>(criticResult.content);
      if (!parsedCritic.ok || !parsedCritic.data) {
        console.warn('El crítico no devolvió JSON válido:', parsedCritic.detail);
        repairHistory.push({
          round,
          issuesBefore,
          requested: [],
          rejected: [{ type: 'parseo', reason: parsedCritic.detail ?? 'JSON inválido' }],
          applied: [],
          issuesAfter: issuesBefore,
          verdict: 'critic_unavailable',
          note: parsedCritic.detail ?? 'JSON inválido',
        });
        break;
      }

      const { verdict, note, repairs, rejected } = parseCriticRepairs(parsedCritic.data, plan, ctx);

      const requested: AppliedRepair[] = repairs.map((r) => ({
        type: r.type,
        slideIndex: r.slideIndex,
        reason: r.reason,
        addressedCodes: r.addressedCodes,
      }));

      /*
       * Cuando el crítico dice que el problema es la ruta, no se parchea.
       *
       * Insistir con operaciones puntuales sobre una historia que no cierra produce un
       * plan remendado que pasa la validación y sigue sin funcionar.
       */
      if (verdict === 'needs_route_change') {
        repairHistory.push({
          round,
          issuesBefore,
          requested,
          rejected,
          applied: [],
          issuesAfter: issuesBefore,
          verdict,
          note,
        });
        console.log(`El crítico pide cambiar de ruta: ${note}`);
        break;
      }

      const { plan: repaired, applied, skipped } = applyPlanRepairs(
        plan,
        repairs,
        ctx.beatCoupling,
      );

      const allRejected = [
        ...rejected,
        ...skipped.map((s) => ({ type: s.repair.type, reason: s.reason })),
      ];

      if (applied.length === 0) {
        repairHistory.push({
          round,
          issuesBefore,
          requested,
          rejected: allRejected,
          applied: [],
          issuesAfter: issuesBefore,
          verdict,
          note: note || 'ninguna operación aplicable',
        });
        break;
      }

      plan = repaired;
      appliedRepairs.push(...applied);
      validation = validateCarouselCreativePlan(plan, ctx);

      repairHistory.push({
        round,
        issuesBefore,
        requested,
        rejected: allRejected,
        applied,
        issuesAfter: blockingIssues(validation.issues).map((i) => i.code),
        verdict,
        note,
      });
    }

    const remainingIssues = [...validation.issues];

    if (droppedFigureScenarios.length > 0) {
      remainingIssues.push({
        code: 'dropped_figure_scenario',
        severity: 'advisory',
        slideIndex: null,
        message: `Se ignoraron escenarios numéricos que esta ruta no admite: ${droppedFigureScenarios.join(', ')}.`,
      });
    }

    const unrepairable = unrepairableCodes(validation.issues);
    if (unrepairable.length > 0) {
      remainingIssues.push({
        code: 'route_change_required',
        severity: 'blocking',
        slideIndex: null,
        message: `Estos fallos no se pueden reparar parcheando beats porque los declara el registro: ${unrepairable.join(', ')}. Hay que elegir otra ruta.`,
      });
    }

    const preflight: CarouselPlanPreflight = {
      passed: validation.ok,
      attempts: repairHistory.length,
      appliedRepairs,
      remainingIssues,
      repairHistory,
      /*
       * Un plan que sigue con fallos bloqueantes no es una alternativa.
       *
       * Antes se devolvía con una advertencia y se podía seleccionar igual, que es cómo
       * un set con una composición repetida habría llegado al render.
       */
      selectable: validation.ok,
    };

    const response: GenerateCarouselPlanResponse = {
      plan,
      preflight,
      digest: digestPlan(plan),
      candidateRoutes: candidateRoutes.map((r) => ({
        id: r.id,
        title: r.title,
        premise: r.premise,
        storyQuestion: r.storyQuestion,
      })),
    };

    console.log(
      `Plan listo: ${plan.routeId} (${plan.routeOrigin}), ${plan.storyboard.length} beats, ` +
        `profundiza por ${plan.deepeningMode}, preflight ${validation.ok ? 'aprobado' : 'con fallos'} ` +
        `tras ${repairHistory.length} ronda(s).`,
    );

    return jsonResponse(response);
  } catch (error) {
    console.error('Function error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse({ error: 'api_error', message }, 500);
  }
});
