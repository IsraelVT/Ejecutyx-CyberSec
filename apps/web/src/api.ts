import { supabase } from "./supabase";
const API = import.meta.env.VITE_API_URL;
async function request(path:string, init?:RequestInit){
  const { data } = await supabase.auth.getSession();
  if(!data.session) throw new Error("Debes iniciar sesión.");
  const response=await fetch(`${API}${path}`,{...init,headers:{"content-type":"application/json",authorization:`Bearer ${data.session.access_token}`,...init?.headers}});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error??"No pudimos completar la operación.");
  return body;
}
export const api={
  organizations:()=>request("/v1/organizations"),
  dashboard:(organizationId:string)=>request(`/v1/dashboard?organizationId=${organizationId}`),
  createDomain:(organizationId:string,domain:string)=>request("/v1/assets/domain",{method:"POST",body:JSON.stringify({organizationId,domain})}),
  verifyDomain:(id:string)=>request(`/v1/assets/${id}/verify`,{method:"POST"}),
  scanDomain:(id:string)=>request(`/v1/assets/${id}/scan`,{method:"POST"}),
};
