// Server-side requests stay on synthetic fixtures; business writes are never forwarded.
import './planning-read-safety-fetch.mjs';
import {readFileSync} from 'node:fs';
const previous=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(u.origin==='https://synthetic-period.supabase.co') {
  const c=JSON.parse(readFileSync(process.env.PLANNING_CONTROL_FILE,'utf8'));
  if(u.pathname==='/auth/v1/user')return Response.json(c.syntheticUser);
  if(u.pathname==='/rest/v1/admin_users')return Response.json([{email:c.syntheticUser.email}]);
 }
 if(u.hostname.endsWith('.supabase.co') && u.origin!==process.env.NEXT_PUBLIC_SUPABASE_URL)throw Error('Non-fixture Supabase access blocked');
 if(u.origin===process.env.NEXT_PUBLIC_SUPABASE_URL&&u.pathname==='/rest/v1/rpc/get_shared_workspace_view'){
  const control=JSON.parse(readFileSync(process.env.PLANNING_CONTROL_FILE,'utf8'));
  if(control.sharedFailure==='throw')throw Error('Synthetic shared response lost');
  if(control.sharedFailure==='error')return Response.json({message:'Synthetic unavailable'},{status:500});
  return Response.json(control.sharedPayload??null);
 }
 return previous(input,init);
};
