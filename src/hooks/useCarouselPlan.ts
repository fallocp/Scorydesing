/**
 * useCarouselPlan — el paso que decide la historia, antes del guion.
 *
 * Separado de `useCarouselQueue` a propósito. Ese hook es dueño del ciclo de vida de un
 * carrusel y persiste todo lo que toca en la fila del banco; el plan todavía no se
 * persiste porque nada lo consume aún: `generate-carousel-script` sigue decidiendo su
 * propia estructura. Meterlo ahí mezclaría estado que se guarda con estado que no, y la
 * primera pregunta al depurar sería cuál de los dos quedó a medias.
 *
 * Lo que hace este hook es pedir planes y acumularlos, para poder generar tres historias
 * del MISMO copy y leerlas una junto a otra. Cada llamada excluye las rutas que ya
 * salieron y manda los digests de las historias anteriores, que es lo que le permite al
 * validador rechazar una historia nueva por parecerse a las viejas.
 */

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { CopyBankItem } from './useDesignCopyBank';
import {
  getCarouselPreset,
  type CarouselObjective,
  type DesignImageType,
} from '@/types/design-studio';
import type {
  CarouselCommercialIntent,
  CarouselCreativePlan,
  CarouselPlanDigest,
  CarouselPlanPreflight,
} from '../../supabase/functions/_shared/carousel-plan-types';

/** Una ruta que también servía. Se ofrece para poder pedir otra historia. */
export interface CarouselRouteOption {
  id: string;
  title: string;
  premise: string;
  storyQuestion: string;
}

export interface CarouselPlanAttempt {
  plan: CarouselCreativePlan;
  preflight: CarouselPlanPreflight;
  digest: CarouselPlanDigest;
}

export interface UseCarouselPlanParams {
  bankItem: CopyBankItem | null;
  branchId: string | null;
}

export function useCarouselPlan({ bankItem, branchId }: UseCarouselPlanParams) {
  const { activeBusinessId } = useActiveBusiness();

  const [attempts, setAttempts] = useState<CarouselPlanAttempt[]>([]);
  const [candidateRoutes, setCandidateRoutes] = useState<CarouselRouteOption[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * La historia elegida para escribir el guion, por `planId`.
   *
   * Se guarda el id y no el objeto para que no haya dos copias del mismo plan capaces de
   * discrepar. Y vive aquí, junto a los intentos, porque la selección solo tiene sentido
   * respecto de ellos: al limpiar la comparación tiene que irse con ella.
   */
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  /**
   * Espejo sincrónico de lo ya generado.
   *
   * `attempts` no sirve para esto: el usuario puede picar el botón otra vez antes de que
   * React aplique el estado del intento anterior, y ahí el segundo request saldría sin
   * excluir la ruta del primero ni mandar su digest — o sea, con la misma historia dos
   * veces, que es justo lo que este paso vino a evitar.
   */
  const usedRouteIds = useRef<string[]>([]);
  const digests = useRef<CarouselPlanDigest[]>([]);

  const createPlan = useCallback(
    async (params: {
      presetSlug: string;
      objective: CarouselObjective;
      imageType: DesignImageType;
      commercialIntent?: CarouselCommercialIntent;
      forwardDirection?: 'import' | 'export';
      guidance?: string;
    }): Promise<boolean> => {
      if (!bankItem || !activeBusinessId) return false;

      const preset = getCarouselPreset(params.presetSlug);
      setIsPlanning(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'generate-carousel-plan',
          {
            body: {
              business_id: activeBusinessId,
              branch_id: branchId,
              vertical_id: bankItem.row.vertical_id ?? null,
              /**
               * Solo headline y body.
               *
               * El CTA no va: el plan decide la historia, y el cierre lo resuelve el
               * objetivo del set en el paso del copy. Mandarlo aquí invitaría al
               * planificador a diseñar hacia una frase que quizá no se va a usar.
               */
              seedCopy: {
                headline: bankItem.row.headline,
                body: bankItem.row.subcopy ?? '',
              },
              /**
               * Solo los roles.
               *
               * El trabajo narrativo de cada beat lo resuelve la función. La versión
               * anterior mandaba `CAROUSEL_ROLE_BRIEFS` y `CAROUSEL_ROLE_LAYOUT_HINT`, y
               * entre los dos dictaban los beats 3, 4 y 5 de cualquier historia: tres
               * rutas distintas devolvieron tres storyboards con los mismos beats y la
               * misma secuencia exacta de composiciones.
               */
              roles: preset.roles,
              presetSlug: params.presetSlug,
              // Cómo se lee el set: sin esto el validador asume arco encadenado y
              // castiga a un checklist por no encadenar sus ítems.
              beatCoupling: preset.beatCoupling,
              layoutPolicy: preset.layoutPolicy,
              closingPolicy: preset.closingPolicy,
              objective: params.objective,
              commercialIntent: params.commercialIntent,
              forwardDirection: params.forwardDirection,
              imageType: params.imageType,
              angleName: bankItem.meta.angleName,
              industryName: bankItem.meta.industryName,
              /*
               * Las rutas ya usadas salen del catálogo de este request.
               *
               * Exclusión dura y no solo degradación de orden: aquí el usuario está
               * comparando historias a propósito, y repetir una ya vista no le dice nada.
               */
              excludeRouteIds: usedRouteIds.current,
              priorPlanDigests: digests.current,
              // Comparación y no producción: se pidieron varias versiones del mismo copy
              // adrede, así que parecerse a la anterior sí bloquea.
              diversityMode: 'comparison',
              allowAgentProposedRoute: false,
              guidance: params.guidance?.trim() || undefined,
            },
          },
        );

        if (fnError || !data?.plan) {
          throw new Error(data?.message ?? fnError?.message ?? 'No se generó el plan');
        }

        const attempt: CarouselPlanAttempt = {
          plan: data.plan as CarouselCreativePlan,
          preflight: data.preflight as CarouselPlanPreflight,
          digest: data.digest as CarouselPlanDigest,
        };

        usedRouteIds.current = [...usedRouteIds.current, attempt.plan.routeId];
        digests.current = [...digests.current, attempt.digest];
        setAttempts((prev) => [...prev, attempt]);
        setCandidateRoutes((data.candidateRoutes ?? []) as CarouselRouteOption[]);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error generando el plan del carrusel');
        return false;
      } finally {
        setIsPlanning(false);
      }
    },
    [bankItem, activeBusinessId, branchId],
  );

  const clearPlans = useCallback(() => {
    usedRouteIds.current = [];
    digests.current = [];
    setAttempts([]);
    setCandidateRoutes([]);
    setSelectedPlanId(null);
    setError(null);
  }, []);

  /**
   * Elegir una historia, o deseleccionar la que estaba.
   *
   * Solo las utilizables: un plan con fallos bloqueantes después de las dos rondas de
   * reparación no es una alternativa, y poder elegirlo es exactamente cómo un set con una
   * composición repetida llegaría al render.
   */
  const selectPlan = useCallback((planId: string | null) => {
    setSelectedPlanId((current) => {
      if (planId === null || planId === current) return null;
      return planId;
    });
  }, []);

  /**
   * Rutas del registro que quedan sin probar para esta combinación.
   *
   * Se deriva de `attempts` y no del ref. El ref existe para que `createPlan` no lea
   * estado viejo entre dos clics rápidos; leerlo en el render no dispara una
   * actualización, así que este contador se quedaría en el valor de la corrida anterior.
   */
  const usedInRender = new Set(attempts.map((a) => a.plan.routeId));
  const remainingRoutes = candidateRoutes.filter((r) => !usedInRender.has(r.id));

  /**
   * El intento elegido, resuelto contra la lista y contra su preflight.
   *
   * Se filtra por `selectable` aquí y no solo en el botón: si un plan seleccionado
   * dejara de serlo, la única defensa sería la UI, y el guion se escribiría contra una
   * historia que el validador rechazó.
   */
  const selectedAttempt =
    attempts.find((a) => a.plan.planId === selectedPlanId && a.preflight.selectable) ?? null;

  return {
    attempts,
    candidateRoutes,
    remainingRoutes,
    isPlanning,
    error,
    selectedPlanId: selectedAttempt?.plan.planId ?? null,
    selectedAttempt,
    selectPlan,
    createPlan,
    clearPlans,
  };
}
