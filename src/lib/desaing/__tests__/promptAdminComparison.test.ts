import { describe, expect, it, vi } from 'vitest';
import { createPromptAdminComparisonController, type PromptComparisonStorage } from '../promptAdminComparison';
import { DesignServerClientError, type DesignServerClient } from '../serverClient';
import { buildPromptAdminTestOperations } from '../../../../supabase/functions/_shared/desaing/promptAdminComparison';
import { evaluatePromptAdminCorpus } from '../../../../supabase/functions/_shared/desaing/promptAdminCorpus';
import { promptAdminTextHash, promptAdminTestHash, type PromptAdminTest } from '../../../../supabase/functions/_shared/desaing/promptAdmin';
import { materialHash } from '../../../../supabase/functions/_shared/desaing/materials';
import { createServerSnapshot, applyServerCommand, type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import { productionPng, productionTestResult } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/productionFixture';

const biz='a0000000-0000-4000-8000-000000000001',actor='a0000000-0000-4000-8000-000000000002',testId='a0000000-0000-4000-8000-000000000003';
async function fixture() {
  const corpus=await evaluatePromptAdminCorpus('Base','Propuesta'),visual_case={instruction:'Composición de mundo.',approved_copy:'México · US$25',references:[]};
  const content={id:testId,business_id:biz,actor_id:actor,draft_id:'a0000000-0000-4000-8000-000000000004',draft_revision:1,
    base_hash:await promptAdminTextHash('Base'),candidate_hash:await promptAdminTextHash('Propuesta'),corpus,corpus_hash:await materialHash(corpus),visual_case,executor:'image_api' as const,
    operations:buildPromptAdminTestOperations({test_id:testId,business_id:biz,actor_id:actor,base_prompt:'Base',candidate_prompt:'Propuesta',visual_case,executor:'image_api'})};
  const test:PromptAdminTest={...content,test_hash:await promptAdminTestHash(content),created_at:'2026-09-18T12:00:00Z'};
  const policy:ServerPolicy={business_id:biz,enabled:true,policy_id:'test',limit_micro_usd:5000000,max_image_outputs:4,reservation_per_output_micro_usd:1000000,enabled_image_profiles:['flare_candidate'],responses_image_enabled:true};
  let state=createServerSnapshot(biz,policy),remaining=4,activeActor=actor,fail:'none'|'lost'|'refused'='none';
  const data=new Map<string,string>(),storage:PromptComparisonStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)}};
  const client={session:vi.fn(async()=>({actorId:activeActor})),read:vi.fn(async()=>({revision:state.jobs.jobs.length,state:structuredClone(state),enabled:true,
    generation:{profile:'flare_candidate',executor:'image_api',max_reference_edge:1024,max_brief_bytes:4000,remaining_outputs:remaining}})),
    command:vi.fn<DesignServerClient['command']>(async(_biz,command)=>{
      if(fail==='refused'){fail='none';throw new DesignServerClientError('job_quota_exceeded',429)}
      if(command.kind==='enqueue') {const result=await productionTestResult(createServerSnapshot(biz,policy),policy,command.operation,productionPng(50+state.jobs.jobs.length),false);
        const version=result.state.assets.versions[0],suffix=command.operation.operation_key.endsWith(':before')?'before':'after';
        version.identity.asset_id=`result-${suffix}`;version.storage.storage_key=`${biz}/generated/${suffix}.png`;
        result.state.jobs.jobs[0].calls[0].receipt!.outputs[0].asset=structuredClone(version.identity);
        state.jobs.jobs.push(...result.state.jobs.jobs);state.assets.versions.push(version);remaining--;
        if(fail==='lost'){fail='none';throw new DesignServerClientError('server_response_unknown')}
      }else if(command.kind==='review')state=applyServerCommand(state,policy,actor,command,200).state;
      return {revision:state.jobs.jobs.length};}),
  } as unknown as DesignServerClient;
  const make=()=>createPromptAdminComparisonController({client,test,storage,newId:()=> 'a0000000-0000-4000-8000-000000000099'});
  return{client,test,storage,make,data,get state(){return state},remaining:(value:number)=>{remaining=value},actor:(value:string)=>{activeActor=value},fail:(value:typeof fail)=>{fail=value}};
}
describe('prompt comparison explicit admission and recovery',()=>{
  it('read/reload only loads frozen operations and a one-slot budget starts no image',async()=>{
    const f=await fixture(),c=f.make();await c.load();expect(f.client.command).not.toHaveBeenCalled();f.remaining(1);
    await expect(c.generate()).rejects.toThrow('prompt_comparison_quota');expect(f.client.command).not.toHaveBeenCalled();expect(f.data.size).toBe(0);
  });
  it('generates each side once; reopening adopts matching durable jobs and approves the exact images',async()=>{
    const f=await fixture(),c=f.make();await c.load();await c.generate();expect(f.client.command).toHaveBeenCalledTimes(2);c.close();
    const reload=f.make();await reload.load();expect(reload.snapshot().items.map(i=>i.status)).toEqual(['needs_review','needs_review']);
    await reload.generate();expect(f.client.command).toHaveBeenCalledTimes(2);await reload.approve('before');await reload.approve('after');
    const submit=vi.fn(async(_input:unknown)=>{});await reload.review({decision:'approved',criteria:{copy:true,visual:true,regression:true},notes:'Comparé letras, cifras y aire.'},submit);
    expect(submit).toHaveBeenCalledOnce();expect(submit.mock.calls[0][0]).toMatchObject({test_id:f.test.id,test_hash:f.test.test_hash});
    expect(f.state.jobs.jobs.every(job=>job.calls[0].state==='approved')).toBe(true);
  });
  it('a lost first acknowledgement pauses the pair; reload reads it and explicit continuation sends only the missing side',async()=>{
    const f=await fixture(),c=f.make();await c.load();f.fail('lost');await expect(c.generate()).rejects.toMatchObject({code:'server_response_unknown'});
    expect(f.client.command).toHaveBeenCalledTimes(1);c.close();const next=f.make();await next.load();expect(next.snapshot().needed).toBe(1);
    expect(f.client.command).toHaveBeenCalledTimes(1);await next.generate();expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('persists the send barrier before IO; an unresolved missing job cannot be resent after reload',async()=>{
    const f=await fixture();vi.mocked(f.client.command).mockImplementationOnce(async()=>{expect([...f.data.values()][0]).toContain('before');throw Error('network')});
    const c=f.make();await c.load();await expect(c.generate()).rejects.toThrow('network');c.close();const reload=f.make();await reload.load();
    await expect(reload.generate()).rejects.toThrow('prompt_comparison_uncertain');expect(f.client.command).toHaveBeenCalledOnce();
  });
  it('known pre-admission refusal permits an explicit retry but unavailable local storage sends nothing',async()=>{
    const f=await fixture(),c=f.make();await c.load();f.fail('refused');await expect(c.generate()).rejects.toMatchObject({code:'job_quota_exceeded'});
    expect(c.snapshot().items[0].status).toBe('saved');f.storage.setItem=()=>{throw Error('storage full')};await expect(c.generate()).rejects.toThrow('storage full');
    expect(f.client.command).toHaveBeenCalledOnce();
  });
  it('rejects actor changes and a tampered frozen test before commands',async()=>{
    const f=await fixture(),c=f.make();await c.load();f.actor('foreign');await expect(c.generate()).rejects.toThrow('server_session_changed');expect(f.client.command).not.toHaveBeenCalled();
    f.actor(actor);f.test.operations.after.context.instruction='Tampered';await expect(f.make().load()).rejects.toThrow('invalid_prompt_admin_request');expect(f.client.command).not.toHaveBeenCalled();
  });
  it('an ambiguous review keeps its exact ID, assets and criteria across reload',async()=>{
    const f=await fixture(),c=f.make();await c.load();await c.generate();await c.approve('before');await c.approve('after');
    const input={decision:'rejected' as const,criteria:{copy:true,visual:false,regression:true},notes:'La composición no mejora.'};
    const lost=vi.fn(async(_input:unknown)=>{throw Error('lost acknowledgement')});await expect(c.review(input,lost)).rejects.toThrow('lost acknowledgement');
    c.close();const reload=f.make();await reload.load();expect(reload.savedReview()).toEqual(lost.mock.calls[0][0]);
    const retry=vi.fn(async(_input:unknown)=>{});await reload.review(input,retry);expect(retry.mock.calls[0][0]).toEqual(lost.mock.calls[0][0]);
    await expect(reload.review({...input,notes:'Changed reason'},retry)).rejects.toThrow('prompt_comparison_review_frozen');
  });
  it('rejects a comparison with durable unapproved outputs without approving either image',async()=>{
    const f=await fixture(),c=f.make();await c.load();await c.generate();
    const submit=vi.fn(async(_input:unknown)=>{}),criteria={copy:false,visual:false,regression:false};
    await expect(c.review({decision:'approved',criteria:{copy:true,visual:true,regression:true},notes:'No review yet'},submit)).rejects.toThrow('prompt_comparison_review_required');
    await c.review({decision:'rejected',criteria,notes:'La propuesta cambia cifras y pierde jerarquía.'},submit);
    expect(submit).toHaveBeenCalledOnce();expect(f.state.jobs.jobs.every(job=>job.calls[0].state==='needs_review')).toBe(true);expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('closing during the first admitted operation preserves it and never starts the second',async()=>{
    const f=await fixture(),c=f.make();await c.load();const execute=f.client.command;
    f.client.command=vi.fn(async(...args:Parameters<DesignServerClient['command']>)=>{const value=await execute(...args);c.close();return value});
    await expect(c.generate()).rejects.toThrow('prompt_comparison_closed');expect(f.state.jobs.jobs).toHaveLength(1);expect(f.client.command).toHaveBeenCalledOnce();
  });
});
