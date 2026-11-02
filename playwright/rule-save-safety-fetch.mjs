// Local only: authentication may use the saved session; every DB read is synthetic.
import './roadmap-tax-load-failure-fetch.mjs';
import { readFileSync } from 'node:fs';
const file=process.env.ROADMAP_TAX_CONTROL_FILE;
const fallback=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
 if(url.origin===process.env.NEXT_PUBLIC_SUPABASE_URL&&url.pathname.startsWith('/rest/v1/')&&['GET','HEAD'].includes(method)){
  const c=JSON.parse(readFileSync(file,'utf8')),table=url.pathname.split('/').at(-1);
  if(['rules','rule_conditions','rule_actions','procedures'].includes(table)){
   if(c.failTable===table){if(c.failure==='throw')throw new Error('Synthetic read failure');if(c.failure==='null')return Response.json(null);return Response.json({message:'Synthetic read error'},{status:400});}
   let rows=c[table];
   const id=url.searchParams.get(table==='rules'?'id':'rule_id');
   if(id)rows=rows.filter(r=>String(r[table==='rules'?'id':'rule_id'])===id.slice(3));
   if(table==='rules'&&url.searchParams.get('name'))rows=rows.filter(r=>r.name===url.searchParams.get('name').slice(3));
   if(table==='rules')rows=rows.map(r=>({...r,rule_conditions:c.rule_conditions.filter(x=>x.rule_id===r.id),rule_actions:c.rule_actions.filter(x=>x.rule_id===r.id)}));
   return Response.json(rows);
  }
 }
 return fallback(input,init);
};
