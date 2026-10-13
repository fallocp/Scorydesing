-- ---------------------------------------------------------------------------
-- Brand typography: Fraunces/Inter → Montserrat/Poppins
-- ---------------------------------------------------------------------------
-- The visual system (docs/prompts/XENDING_VISUAL_SYSTEM_v1.md §4) has always
-- specified Montserrat for titles and Poppins for small text. The database said
-- something else: `business_tenants.fonts` carried
-- {"display":"Fraunces","body":"Inter"}, and the tenant master prompt told the
-- model "Headlines: Fraunces (serif, bold, impactante)".
--
-- That is why generated pieces came out with serif headlines while the image
-- prompt forbade serifs: the two halves of the system disagreed, and the DB half
-- was the one feeding the brand guide into the prompts.
--
-- This migration makes the database agree with the visual system. The code side
-- (renderer templates, generate-design-html, templateAssembler, presentations,
-- bulletins) is updated in the same change.
--
-- Fraunces is NOT removed from the brand — it keeps the legal note, which is
-- expressed in CSS as --font-legal and does not live in this jsonb.
--
-- Non-destructive and idempotent: both statements are narrow UPDATEs that are
-- no-ops once applied.
-- ---------------------------------------------------------------------------

-- 1. Font tokens per tenant ---------------------------------------------------
-- `mono` is left alone: JetBrains Mono is still the figures face.
update public.business_tenants
set fonts = jsonb_set(
      jsonb_set(coalesce(fonts, '{}'::jsonb), '{display}', '"Montserrat"'),
      '{body}', '"Poppins"'
    )
where fonts ->> 'display' = 'Fraunces'
   or fonts ->> 'body' = 'Inter';

-- 2. The typography block inside the tenant master prompt --------------------
-- fetchBusinessContext feeds this text to the content and slide agents, so a
-- stale line here quietly overrides everything the code asks for.
update public.master_prompts
set prompt_text = replace(
      replace(
        prompt_text,
        '- Headlines: Fraunces (serif, bold, impactante)',
        '- Headlines: Montserrat (sans-serif geométrica, bold/extrabold, impactante)'
      ),
      '- Body: Inter (sans-serif, legible, profesional)',
      '- Body: Poppins (sans-serif geométrica, legible, profesional). Notas legales: Fraunces'
    )
where prompt_text like '%Headlines: Fraunces%'
   or prompt_text like '%Body: Inter (sans-serif, legible, profesional)%';

-- Verificación
select slug, fonts ->> 'display' as display, fonts ->> 'body' as body
from public.business_tenants
order by slug;

select id, business_id, prompt_type,
       prompt_text like '%Montserrat%' as tiene_montserrat,
       prompt_text like '%Headlines: Fraunces%' as quedo_fraunces
from public.master_prompts
order by business_id, prompt_type nulls first;
