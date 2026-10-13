-- =============================================================================
-- Seed: template_registry — Xending brand templates + global starter templates
-- =============================================================================
-- Depends on: 20260525_create_template_registry.sql
--
-- Xending business_id: a0000000-0000-0000-0000-000000000001
--
-- Tone mapping from legacy designTemplates.ts:
--   card-light    → light   (content_type: corporate)
--   card-dark     → dark    (content_type: corporate)
--   card-coral    → medium  (content_type: corporate)
--   card-turquesa → medium  (content_type: market-update)
--   card-navy     → dark    (content_type: market-update)
--
-- All existing templates = layout_variation 'A'
-- Platforms: instagram-story (primary), instagram-post, linkedin-post, facebook-post, banner
-- =============================================================================

-- =============================================================================
-- SECTION 1: Xending brand templates (business_id = Xending)
-- =============================================================================
-- These are the 6 existing Xending templates migrated from designTemplates.ts.
-- Each template is seeded for instagram-story (the primary format in designTemplates.ts).
-- The renderer/templates/ folder handles multi-platform rendering separately.
-- =============================================================================

-- 1.1 Card Light → corporate / light / A (all 5 platforms)
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
-- instagram-story
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-story', 'light', 'A',
  '<!-- Xending card-light: see renderer/templates/card-light/instagram-story.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
-- instagram-post
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-post', 'light', 'A',
  '<!-- Xending card-light: see renderer/templates/card-light/instagram-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
-- linkedin-post
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'linkedin-post', 'light', 'A',
  '<!-- Xending card-light: see renderer/templates/card-light/linkedin-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
-- facebook-post
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'facebook-post', 'light', 'A',
  '<!-- Xending card-light: see renderer/templates/card-light/facebook-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
-- banner
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'banner', 'light', 'A',
  '<!-- Xending card-light: see renderer/templates/card-light/banner.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- 1.2 Card Dark → corporate / dark / A (all 5 platforms)
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-story', 'dark', 'A',
  '<!-- Xending card-dark: see renderer/templates/card-dark/instagram-story.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-post', 'dark', 'A',
  '<!-- Xending card-dark: see renderer/templates/card-dark/instagram-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'linkedin-post', 'dark', 'A',
  '<!-- Xending card-dark: see renderer/templates/card-dark/linkedin-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'facebook-post', 'dark', 'A',
  '<!-- Xending card-dark: see renderer/templates/card-dark/facebook-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'banner', 'dark', 'A',
  '<!-- Xending card-dark: see renderer/templates/card-dark/banner.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- 1.3 Card Coral → corporate / medium / A (all 5 platforms)
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-story', 'medium', 'A',
  '<!-- Xending card-coral: see renderer/templates/card-turquesa/instagram-story.html (coral variant via css_overrides) -->',
  'body { background: #FFF5F2; } .bg-mesh { background: radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); } .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }',
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'instagram-post', 'medium', 'A',
  '<!-- Xending card-coral: see renderer/templates/card-turquesa/instagram-post.html (coral variant via css_overrides) -->',
  'body { background: #FFF5F2; } .bg-mesh { background: radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); } .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }',
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'linkedin-post', 'medium', 'A',
  '<!-- Xending card-coral: see renderer/templates/card-turquesa/linkedin-post.html (coral variant via css_overrides) -->',
  'body { background: #FFF5F2; } .bg-mesh { background: radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); } .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }',
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'facebook-post', 'medium', 'A',
  '<!-- Xending card-coral: see renderer/templates/card-turquesa/facebook-post.html (coral variant via css_overrides) -->',
  'body { background: #FFF5F2; } .bg-mesh { background: radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); } .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }',
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'corporate', 'banner', 'medium', 'A',
  '<!-- Xending card-coral: see renderer/templates/card-turquesa/banner.html (coral variant via css_overrides) -->',
  'body { background: #FFF5F2; } .bg-mesh { background: radial-gradient(ellipse 900px 700px at 85% 15%, rgba(255,120,70,0.28) 0%, transparent 55%), radial-gradient(ellipse 800px 600px at 10% 85%, rgba(46,212,199,0.15) 0%, transparent 60%), linear-gradient(160deg, #FFF5F2 0%, #FFE8E0 50%, #FFF0EB 100%); } .cta { background: linear-gradient(135deg, #0F1419, #1a2332); color: #fff; }',
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- 1.4 Card Turquesa → market-update / medium / A (all 5 platforms)
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'instagram-story', 'medium', 'A',
  '<!-- Xending card-turquesa: see renderer/templates/card-turquesa/instagram-story.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'instagram-post', 'medium', 'A',
  '<!-- Xending card-turquesa: see renderer/templates/card-turquesa/instagram-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'linkedin-post', 'medium', 'A',
  '<!-- Xending card-turquesa: see renderer/templates/card-turquesa/linkedin-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'facebook-post', 'medium', 'A',
  '<!-- Xending card-turquesa: see renderer/templates/card-turquesa/facebook-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'banner', 'medium', 'A',
  '<!-- Xending card-turquesa: see renderer/templates/card-turquesa/banner.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- 1.5 Card Navy → market-update / dark / A (all 5 platforms)
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'instagram-story', 'dark', 'A',
  '<!-- Xending card-navy: see renderer/templates/card-navy/instagram-story.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'instagram-post', 'dark', 'A',
  '<!-- Xending card-navy: see renderer/templates/card-navy/instagram-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'linkedin-post', 'dark', 'A',
  '<!-- Xending card-navy: see renderer/templates/card-navy/linkedin-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'facebook-post', 'dark', 'A',
  '<!-- Xending card-navy: see renderer/templates/card-navy/facebook-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'market-update', 'banner', 'dark', 'A',
  '<!-- Xending card-navy: see renderer/templates/card-navy/banner.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true},{"name":"dataPoint","type":"text","required":false,"maxLength":40}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- 1.6 Breaking News → breaking-news / dark / A (all 5 platforms)
-- The breaking-news template uses a distinct dark/urgent style
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  'breaking-news', 'instagram-story', 'dark', 'A',
  '<!-- Xending breaking-news: see renderer/templates/breaking-news/instagram-story.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"imageUrl","type":"image","required":false},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'breaking-news', 'instagram-post', 'dark', 'A',
  '<!-- Xending breaking-news: see renderer/templates/breaking-news/instagram-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"imageUrl","type":"image","required":false},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'breaking-news', 'linkedin-post', 'dark', 'A',
  '<!-- Xending breaking-news: see renderer/templates/breaking-news/linkedin-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"imageUrl","type":"image","required":false},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'breaking-news', 'facebook-post', 'dark', 'A',
  '<!-- Xending breaking-news: see renderer/templates/breaking-news/facebook-post.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"imageUrl","type":"image","required":false},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
),
(
  'a0000000-0000-0000-0000-000000000001',
  'breaking-news', 'banner', 'dark', 'A',
  '<!-- Xending breaking-news: see renderer/templates/breaking-news/banner.html -->',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"imageUrl","type":"image","required":false},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (business_id, content_type, platform, visual_tone, layout_variation) DO NOTHING;

-- =============================================================================
-- SECTION 2: Global starter templates (business_id = NULL)
-- =============================================================================
-- Simplified, brand-agnostic templates that new brands can use temporarily
-- until their own templates are generated via the Template Generator Agent.
-- These use CSS custom properties (--brand-primary, --brand-secondary, etc.)
-- so they adapt to any brand's colors when hydrated.
-- =============================================================================

-- 2.1 Starter: corporate / light / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'corporate', 'instagram-story', 'light', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#333;--brand-secondary:#666;--brand-accent:#0066cc}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:#F5F3F0}
.card{position:absolute;top:140px;left:50px;right:50px;background:#fff;border-radius:32px;padding:48px 56px;box-shadow:0 20px 60px rgba(0,0,0,0.08)}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-primary)}
.headline{font-size:56px;font-weight:700;line-height:1.1;color:#111;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:#555;margin-bottom:28px}
.image-area{width:100%;height:600px;border-radius:16px;overflow:hidden;margin-bottom:24px}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:40px;font-weight:600;color:#111;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#fff;border-radius:100px;font-size:20px;font-weight:600}
.disclaimer{font-size:12px;color:#999;margin-top:12px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.2 Starter: corporate / dark / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'corporate', 'instagram-story', 'dark', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#fff;--brand-secondary:#ccc;--brand-accent:#2ED4C7}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:#0F1419}
.card{position:absolute;top:140px;left:50px;right:50px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:32px;padding:48px 56px}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:#fff}
.headline{font-size:56px;font-weight:700;line-height:1.1;color:#fff;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:rgba(255,255,255,0.7);margin-bottom:28px}
.image-area{width:100%;height:600px;border-radius:16px;overflow:hidden;margin-bottom:24px}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:40px;font-weight:600;color:#fff;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#0F1419;border-radius:100px;font-size:20px;font-weight:700}
.disclaimer{font-size:12px;color:rgba(255,255,255,0.35);margin-top:12px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.3 Starter: corporate / medium / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'corporate', 'instagram-story', 'medium', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#333;--brand-secondary:#666;--brand-accent:#FF7A4A}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:linear-gradient(160deg,#f8f5f1 0%,#ffe8e0 50%,#f0fdfb 100%)}
.card{position:absolute;top:140px;left:50px;right:50px;background:#fff;border-radius:32px;padding:48px 56px;box-shadow:0 20px 60px rgba(255,120,70,0.12)}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-primary)}
.headline{font-size:56px;font-weight:700;line-height:1.1;color:#111;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:#555;margin-bottom:28px}
.image-area{width:100%;height:600px;border-radius:16px;overflow:hidden;margin-bottom:24px}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:40px;font-weight:600;color:#111;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#fff;border-radius:100px;font-size:20px;font-weight:600}
.disclaimer{font-size:12px;color:#999;margin-top:12px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.4 Starter: breaking-news / dark / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'breaking-news', 'instagram-story', 'dark', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#fff;--brand-accent:#FF7A4A;--brand-secondary:#2ED4C7}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;color:#fff;background:radial-gradient(ellipse at 20% 50%,var(--brand-secondary) 0%,transparent 50%),radial-gradient(ellipse at 80% 20%,var(--brand-accent) 0%,transparent 50%),#0F1419}
.badge{position:absolute;top:80px;left:60px;display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--brand-accent);border-radius:100px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.badge::before{content:"";width:8px;height:8px;background:#fff;border-radius:50%;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.content{position:absolute;top:240px;left:60px;right:60px}
.headline{font-size:64px;font-weight:700;line-height:1.05;margin-bottom:24px}
.subcopy{font-size:22px;line-height:1.4;color:rgba(255,255,255,0.8);margin-bottom:32px}
.data-card{display:inline-flex;flex-direction:column;gap:4px;padding:16px 24px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:12px;margin-bottom:24px}
.data-label{font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5)}
.data-value{font-size:36px;font-weight:700;color:var(--brand-secondary)}
.footer{position:absolute;bottom:60px;left:60px;right:60px;text-align:center}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#fff;border-radius:100px;font-size:20px;font-weight:600;margin-bottom:12px}
.source{font-size:13px;color:rgba(255,255,255,0.4)}
.disclaimer{font-size:12px;color:rgba(255,255,255,0.3);margin-top:8px}
</style></head><body>
<div class="badge">{{category}}</div>
<div class="content">
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="data-card"><span class="data-label">{{dataLabel}}</span><span class="data-value">{{dataValue}}</span></div>
</div>
<div class="footer">
<div class="cta">{{cta}}</div>
<div class="source">{{source}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":100},{"name":"subcopy","type":"text","required":true,"maxLength":250},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"dataLabel","type":"text","required":false,"maxLength":30},{"name":"dataValue","type":"text","required":false,"maxLength":20},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.5 Starter: market-update / medium / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'market-update', 'instagram-story', 'medium', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#333;--brand-accent:#2ED4C7;--brand-secondary:#FF7A4A}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:linear-gradient(160deg,#f0fdfb 0%,#e6faf7 50%,#f0fdfb 100%)}
.card{position:absolute;top:140px;left:50px;right:50px;background:#fff;border-radius:32px;padding:48px 56px;box-shadow:0 20px 60px rgba(46,212,199,0.1)}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-primary)}
.headline{font-size:56px;font-weight:700;line-height:1.1;color:#111;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:#555;margin-bottom:28px}
.data-highlight{display:inline-flex;align-items:center;gap:10px;padding:12px 20px;background:rgba(46,212,199,0.08);border-radius:100px;margin-bottom:24px}
.data-highlight .dot{width:10px;height:10px;border-radius:50%;background:var(--brand-accent)}
.data-highlight span{font-size:18px;font-weight:600;color:#111}
.image-area{width:100%;height:560px;border-radius:16px;overflow:hidden;margin-bottom:24px}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:40px;font-weight:600;color:#111;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#0F1419;border-radius:100px;font-size:20px;font-weight:700}
.disclaimer{font-size:12px;color:#999;margin-top:12px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="data-highlight"><span class="dot"></span><span>{{dataPoint}}</span></div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"dataPoint","type":"text","required":false,"maxLength":40},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.6 Starter: market-update / dark / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'market-update', 'instagram-story', 'dark', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#fff;--brand-accent:#2ED4C7;--brand-secondary:#FF7A4A}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:#0a1628}
.card{position:absolute;top:140px;left:50px;right:50px;background:linear-gradient(145deg,rgba(46,212,199,0.08),rgba(255,255,255,0.03));border:1px solid rgba(46,212,199,0.15);border-radius:32px;padding:48px 56px}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-accent)}
.headline{font-size:56px;font-weight:700;line-height:1.1;color:#fff;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:rgba(255,255,255,0.65);margin-bottom:28px}
.data-highlight{display:inline-flex;align-items:center;gap:10px;padding:12px 20px;background:rgba(46,212,199,0.08);border-radius:100px;margin-bottom:24px}
.data-highlight .dot{width:10px;height:10px;border-radius:50%;background:var(--brand-secondary)}
.data-highlight span{font-size:18px;font-weight:600;color:var(--brand-accent)}
.image-area{width:100%;height:560px;border-radius:16px;overflow:hidden;margin-bottom:24px}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:40px;font-weight:600;color:#fff;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-secondary);color:#fff;border-radius:100px;font-size:20px;font-weight:600}
.disclaimer{font-size:12px;color:rgba(255,255,255,0.3);margin-top:12px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="data-highlight"><span class="dot"></span><span>{{dataPoint}}</span></div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"dataPoint","type":"text","required":false,"maxLength":40},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.7 Starter: event-special / medium / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'event-special', 'instagram-story', 'medium', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#333;--brand-accent:#FF7A4A;--brand-secondary:#2ED4C7}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:linear-gradient(160deg,#fff5f2 0%,#f0fdfb 100%)}
.event-badge{position:absolute;top:80px;left:60px;display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--brand-accent);color:#fff;border-radius:100px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em}
.card{position:absolute;top:200px;left:50px;right:50px;background:#fff;border-radius:32px;padding:48px 56px;box-shadow:0 20px 60px rgba(255,120,70,0.1)}
.brand{display:flex;align-items:center;gap:14px;margin-bottom:28px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-primary)}
.headline{font-size:52px;font-weight:700;line-height:1.1;color:#111;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:#555;margin-bottom:28px}
.image-area{width:100%;height:560px;border-radius:16px;overflow:hidden}
.image-area img{width:100%;height:100%;object-fit:cover}
.footer{position:absolute;bottom:50px;left:60px;right:60px;text-align:center}
.punchline{font-size:38px;font-weight:600;color:#111;margin-bottom:20px}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#fff;border-radius:100px;font-size:20px;font-weight:600}
.disclaimer{font-size:12px;color:#999;margin-top:12px}
</style></head><body>
<div class="event-badge">{{category}}</div>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
<div class="image-area"><img src="{{imageUrl}}" alt=""/></div>
</div>
<div class="footer">
<div class="punchline">{{punchline}}</div>
<div class="cta">{{cta}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"imageUrl","type":"image","required":true},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"punchline","type":"text","required":false,"maxLength":60},{"name":"category","type":"text","required":false,"maxLength":20},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- 2.8 Starter: stat-of-the-day / light / A — instagram-story
INSERT INTO public.template_registry (
  business_id, content_type, platform, visual_tone, layout_variation,
  html_template, css_overrides, slots, is_active
) VALUES
(
  NULL,
  'stat-of-the-day', 'instagram-story', 'light', 'A',
  '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><style>
:root{--brand-primary:#333;--brand-accent:#2ED4C7;--brand-secondary:#FF7A4A}
html,body{width:1080px;height:1920px;margin:0;padding:0;overflow:hidden;font-family:system-ui,sans-serif;background:#F5F3F0}
.card{position:absolute;top:200px;left:50px;right:50px;background:#fff;border-radius:32px;padding:56px 64px;box-shadow:0 20px 60px rgba(0,0,0,0.06);text-align:center}
.brand{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:40px}
.brand img{width:56px;height:56px;object-fit:contain}
.brand span{font-size:32px;font-weight:700;color:var(--brand-primary)}
.stat-value{font-size:120px;font-weight:800;color:var(--brand-accent);line-height:1;margin-bottom:16px}
.stat-label{font-size:18px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:32px}
.headline{font-size:48px;font-weight:700;line-height:1.1;color:#111;margin-bottom:20px}
.subcopy{font-size:22px;line-height:1.4;color:#555;margin-bottom:32px}
.footer{position:absolute;bottom:60px;left:60px;right:60px;text-align:center}
.cta{display:inline-block;padding:18px 36px;background:var(--brand-accent);color:#0F1419;border-radius:100px;font-size:20px;font-weight:700}
.source{font-size:13px;color:#999;margin-top:12px}
.disclaimer{font-size:12px;color:#999;margin-top:8px}
</style></head><body>
<div class="card">
<div class="brand"><img src="{{logoUrl}}" alt=""/><span>{{brandName}}</span></div>
<div class="stat-value">{{dataValue}}</div>
<div class="stat-label">{{dataLabel}}</div>
<div class="headline">{{headline}}</div>
<div class="subcopy">{{subcopy}}</div>
</div>
<div class="footer">
<div class="cta">{{cta}}</div>
<div class="source">{{source}}</div>
<div class="disclaimer">{{disclaimer}}</div>
</div>
</body></html>',
  NULL,
  '[{"name":"headline","type":"text","required":true,"maxLength":80},{"name":"subcopy","type":"text","required":true,"maxLength":200},{"name":"logoUrl","type":"image","required":true},{"name":"brandName","type":"text","required":true,"maxLength":30},{"name":"cta","type":"text","required":true,"maxLength":30},{"name":"dataValue","type":"text","required":true,"maxLength":20},{"name":"dataLabel","type":"text","required":true,"maxLength":30},{"name":"source","type":"text","required":false,"maxLength":50},{"name":"disclaimer","type":"text","required":true}]'::jsonb,
  true
)
ON CONFLICT (content_type, platform, visual_tone, layout_variation) WHERE business_id IS NULL DO NOTHING;

-- =============================================================================
-- END OF SEED DATA
-- =============================================================================
-- Summary:
--   Xending brand templates: 6 template sets × 5 platforms = 30 rows
--   Global starter templates: 8 rows (one per content_type × tone combo)
--   Total: 38 rows
--
-- Note: designTemplates.ts is NOT deleted — kept as fallback.
-- The templateAssembler.ts will be evolved (task 5.6) to read from this table.
-- =============================================================================
