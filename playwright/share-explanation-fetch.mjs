// Synthetic SSR fixture only. No requests to the production Supabase project.
import {readFileSync} from 'node:fs';
const original=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(u.origin==='https://synthetic-share.supabase.co'){
  const f=JSON.parse(readFileSync(process.env.SHARE_EXPLANATION_FIXTURE,'utf8'));
  if(u.pathname==='/auth/v1/user')return Response.json(f.user);
  if(u.pathname==='/rest/v1/admin_users')return Response.json([{email:f.user.email}]);
  if(u.pathname==='/rest/v1/workspace_companies')return Response.json(f.company);
  if(u.pathname==='/rest/v1/workspace_share_links')return f.failList?Response.json({message:'Synthetic list unavailable'},{status:500}):Response.json(f.links);
  throw Error('Unsupported synthetic share request');
 }
 if(u.hostname.endsWith('.supabase.co'))throw Error('Non-fixture Supabase access blocked');
 return original(input,init);
};
