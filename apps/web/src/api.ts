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
  resolveFinding:(id:string,status:"accepted"|"resolved"|"open")=>request(`/v1/findings/${id}`,{method:"PATCH",body:JSON.stringify({status})}),
  createIncident:(organizationId:string,input:{title:string;description:string;severity:string})=>request("/v1/incidents",{method:"POST",body:JSON.stringify({organizationId,...input})}),
  updateIncident:(id:string,status:"open"|"contained"|"resolved")=>request(`/v1/incidents/${id}`,{method:"PATCH",body:JSON.stringify({status})}),
  updateOrganization:(id:string,input:{name:string;sector:string;employeeCount:number|null})=>request(`/v1/organizations/${id}`,{method:"PATCH",body:JSON.stringify(input)}),
};
