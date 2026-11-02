// Local only: all DB reads are synthetic; server-side writes are blocked by the base fixture.
import './roadmap-tax-load-failure-fetch.mjs';
import {readFileSync,appendFileSync} from 'node:fs';
const file=process.env.ROADMAP_TAX_CONTROL_FILE;
const fallback=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(u.origin===process.env.NEXT_PUBLIC_SUPABASE_URL&&u.pathname.endsWith('/rest/v1/workspace_procedure_statuses')){
  const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!['GET','HEAD'].includes(method))return fallback(input,init);
  appendFileSync(file+'.reads','read\n');
  const c=JSON.parse(readFileSync(file,'utf8'));
  if(c.statusFailure==='throw')throw new Error('Synthetic status exception');
  if(c.statusFailure==='error')return Response.json({message:'Synthetic status read error'},{status:400});
  if(c.statusFailure==='null')return Response.json(null);
  if(c.statusFailure==='malformed')return Response.json([{}]);
  return Response.json(c.statusRows);
 }
 return fallback(input,init);
};
