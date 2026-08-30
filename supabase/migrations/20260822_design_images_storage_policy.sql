-- design-images storage — allow business members to MANAGE (insert/update/delete)
-- files under their business folder.
--
-- Motivo: el kit del Daily Report FX sube objetos a una ruta fija con `upsert`
-- (sobrescribe al regenerar), lo que requiere UPDATE/DELETE sobre storage.objects.
-- El bucket solo tenía permiso de INSERT (por eso useSaveMockup, que usa nombres
-- únicos y upsert:false, sí funciona, pero el upsert del kit daba 400). Además
-- esto habilita el borrado de mockups.
--
-- Mismo patrón, alcance y seguridad que la política de `brand-assets`
-- (20260521_brand_onboarding_tables.sql): scoped por membresía de negocio.

-- El bucket es público para lectura; solo aseguramos su existencia (idempotente).
INSERT INTO storage.buckets (id, name, public)
VALUES ('design-images', 'design-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Business members can manage design images" ON storage.objects;
CREATE POLICY "Business members can manage design images"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'design-images'
    AND (storage.foldername(name))[1] IN (
      SELECT bt.id::text FROM public.business_tenants bt
      INNER JOIN public.user_business_memberships ubm ON ubm.business_id = bt.id
      WHERE ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'design-images'
    AND (storage.foldername(name))[1] IN (
      SELECT bt.id::text FROM public.business_tenants bt
      INNER JOIN public.user_business_memberships ubm ON ubm.business_id = bt.id
      WHERE ubm.user_id = auth.uid()
    )
  );
