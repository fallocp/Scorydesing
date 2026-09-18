import type { PGlite } from '@electric-sql/pglite';
import { simulatedPiece } from './simulatedPiece';
import type { ProductionSource } from '../../supabase/functions/_shared/desaing/production';

export const PRODUCTION_FIXTURE_ORIGIN = 'https://local-generation.invalid';
export const PRODUCTION_SCHEMA = `CREATE TABLE public.design_mockups(id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES public.business_tenants(id),created_by uuid NOT NULL REFERENCES auth.users(id),image_url text NOT NULL,platform text NOT NULL,selections jsonb,prompt_used text,status text NOT NULL DEFAULT 'saved',created_at timestamptz DEFAULT now(),parent_mockup_id uuid REFERENCES public.design_mockups(id),iteration_feedback text,carousel_group_id uuid,carousel_index smallint,uploaded_at timestamptz);
CREATE TABLE public.copy_bank_items(id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES public.business_tenants(id),headline text,subcopy text,cta text,status text,image_meta jsonb);
CREATE TABLE public.generated_ideas(id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES public.business_tenants(id),headline text,subcopy text,cta text,status text,piece_v2 jsonb);
GRANT SELECT,UPDATE ON public.design_mockups,public.copy_bank_items,public.generated_ideas TO service_role;`;
const id=(n:number)=>`a7000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export async function seedProductionFixture(db:PGlite,businessId:string,actorId:string,objects:Map<string,Uint8Array>) {
  const sources:Record<string,ProductionSource>={}, contexts:Record<string,unknown>={};
  for(let index=1;index<=5;index++) {
    const key=`${businessId}/mockups/original-${index}.png`, url=`${PRODUCTION_FIXTURE_ORIGIN}/storage/v1/object/public/design-images/${key}`;
    const canvas=index===4?{width:1080,height:1350}:{width:1024,height:1024};
    // Different pixel bytes from the low outputs produced by the fake provider.
    objects.set(key,simulatedPiece('medium',index+20,canvas));
    await db.query(`INSERT INTO public.design_mockups(id,business_id,created_by,image_url,platform,selections,prompt_used,uploaded_at,carousel_group_id,carousel_index)
      VALUES($1,$2,$3,$4,'instagram-post',$5,$6,now(),$7,$8)`,[id(index),businessId,actorId,url,
      JSON.stringify(index===2?{original:true}:{original:true,pieceCopy:{headline:'Marca propia',body:'Dato exacto 25 USD',cta:'Conoce más'}}),
      index===3?'Prompt completo que debe conservarse. '.repeat(140):'Diseño editorial con paleta azul y un objeto central.',index>=4?id(index+10):null,index>=4?0:null]);
    if(index<4) sources[['','image','empty','long'][index]]={kind:'image',mockup_id:id(index)};
    else {
      const table=index===4?'copy_bank_items':'generated_ideas',name=index===4?'copy':'generated';
      const slot={id:`real-slot-${index}`,index:0,role:'hook',slideCopy:{headline:'Texto exacto',body:'Cifra 25 USD',cta:'Visita'},
        imageIntent:'Objeto editorial',prompt:'Diseño editorial con paleta azul y un objeto central.',brief:{preserve:'Cifra25'},brandElements:['marca'],status:'done',mockupId:id(index),imageUrl:url};
      const meta={source:'design-studio',customMeta:{retain:true},carousel:{groupId:id(index+10),visualAnchor:'Azul',visualMotif:'Mundo',plan:{story:'conservar'},economicScenario:{amount:25},
        slots:[slot,{...slot,id:`sibling-${index}`,index:1,customField:'original-sibling'}]}};
      const editorial={headline:'Titular editorial',subcopy:'Subcopy intacto',cta:'CTA intacto',status:'approved'};
      await db.query(`INSERT INTO public.${table}(id,business_id,headline,subcopy,cta,status,${index===4?'image_meta':'piece_v2'}) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id(index+20),businessId,editorial.headline,editorial.subcopy,editorial.cta,editorial.status,JSON.stringify(meta)]);
      sources[name]={kind:'carousel',source_table:table,row_id:id(index+20),group_id:id(index+10),slide_id:slot.id};
      contexts[name]={meta,carousel:meta.carousel,editorial};
    }
  }
  return {sources,contexts};
}
