import { addDoc, collection, deleteDoc, doc, documentId, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { DateException, PublicAvailability, PublicSettings, Service } from "../types";
let servicesCache:Service[]|null=null;
let servicesRequest:Promise<Service[]>|null=null;
let settingsCache:PublicSettings|null=null;
let settingsRequest:Promise<PublicSettings>|null=null;
const weekDays=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;

export async function getServices(force=false){
  if(!force&&servicesCache)return servicesCache;
  if(!force&&servicesRequest)return servicesRequest;
  servicesRequest=getDocs(query(collection(db,"services"),orderBy("sortOrder"))).then(snapshot=>{
    servicesCache=snapshot.docs.map(item=>({id:item.id,...item.data()} as Service));
    return servicesCache;
  }).finally(()=>{servicesRequest=null});
  return servicesRequest;
}
export async function saveService(service:Partial<Service>&Pick<Service,"name"|"durationMinutes"|"priceCents"|"active"|"sortOrder">){
  const name=service.name.trim();
  const description=service.description?.trim()||"";
  const durationMinutes=Number(service.durationMinutes);
  const priceCents=Number(service.priceCents);
  const sortOrder=Number(service.sortOrder);
  if(name.length<2||name.length>80)throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if(description.length>160)throw new Error("A descrição deve ter no máximo 160 caracteres.");
  if(!Number.isInteger(durationMinutes)||durationMinutes<5||durationMinutes>480)throw new Error("A duração deve ficar entre 5 e 480 minutos.");
  if(!Number.isInteger(priceCents)||priceCents<0||priceCents>10_000_000)throw new Error("O preço informado é inválido.");
  if(!Number.isInteger(sortOrder)||sortOrder<0)throw new Error("A ordem do serviço é inválida.");
  const data={name,description,iconKey:service.iconKey||"none",durationMinutes,priceCents,active:service.active,sortOrder,updatedAt:serverTimestamp()};
  if(service.id)await updateDoc(doc(db,"services",service.id),data);
  else await addDoc(collection(db,"services"),{...data,createdAt:serverTimestamp()});
  servicesCache=null;
}
export async function removeService(id:string){await deleteDoc(doc(db,"services",id));servicesCache=null}
export async function updateServiceOrder(serviceIds:string[]){
  const batch=writeBatch(db);
  serviceIds.forEach((id,index)=>batch.update(doc(db,"services",id),{sortOrder:index+1,updatedAt:serverTimestamp()}));
  await batch.commit();
  servicesCache=null;
}
export async function getSettings(force=false){
  if(!force&&settingsCache)return settingsCache;
  if(!force&&settingsRequest)return settingsRequest;
  settingsRequest=getDoc(doc(db,"settings","public")).then(snapshot=>{
    if(!snapshot.exists())throw new Error("Configurações não encontradas.");
    const stored=snapshot.data() as PublicSettings;
    settingsCache={...settingsMutation(stored),updatedAt:stored.updatedAt};
    return settingsCache;
  }).finally(()=>{settingsRequest=null});
  return settingsRequest;
}
export async function saveSettings(settings:PublicSettings){
  const data=settingsMutation(settings);
  await setDoc(doc(db,"settings","public"),{...data,updatedAt:serverTimestamp()});
  settingsCache={...data};
}

function settingsMutation(settings:PublicSettings):Omit<PublicSettings,"updatedAt">{
  const businessName=String(settings.businessName??"").trim();
  const publicPhone=String(settings.publicPhone??"").replace(/\D/g,"");
  const slotIntervalMinutes=Number(settings.slotIntervalMinutes);
  const minimumNoticeMinutes=Number(settings.minimumNoticeMinutes);
  const bookingAdvanceDays=Number(settings.bookingAdvanceDays);
  if(businessName.length<2||businessName.length>80)throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if(!/^\d{10,13}$/.test(publicPhone))throw new Error("Informe um telefone público válido com DDD.");
  if(!Number.isInteger(slotIntervalMinutes)||slotIntervalMinutes<5||slotIntervalMinutes>120)throw new Error("O intervalo dos horários deve ficar entre 5 e 120 minutos.");
  if(!Number.isInteger(minimumNoticeMinutes)||minimumNoticeMinutes<0||minimumNoticeMinutes>10080)throw new Error("A antecedência mínima configurada é inválida.");
  if(!Number.isInteger(bookingAdvanceDays)||bookingAdvanceDays<1||bookingAdvanceDays>180)throw new Error("O período de agendamento deve ficar entre 1 e 180 dias.");
  const weeklySchedule=Object.fromEntries(weekDays.map(day=>{
    const periods=settings.weeklySchedule?.[day];
    if(!Array.isArray(periods)||periods.length>3)throw new Error("Cada dia pode ter no máximo três períodos de atendimento.");
    const normalized=periods.map(period=>({start:String(period.start??""),end:String(period.end??"")}));
    normalized.forEach((period,index)=>{
      if(!timePattern.test(period.start)||!timePattern.test(period.end)||period.start>=period.end){
        throw new Error("Revise os horários de abertura e fechamento.");
      }
      if(index>0&&normalized[index-1].end>period.start)throw new Error("Os períodos não podem se sobrepor nem ficar fora de ordem.");
    });
    return[day,normalized];
  }));
  return{businessName,publicPhone,timezone:"America/Recife",slotIntervalMinutes,minimumNoticeMinutes,bookingAdvanceDays,weeklySchedule};
}
export async function getExceptions(){const snapshot=await getDocs(query(collection(db,"exceptions"),orderBy("updatedAt","desc")));return snapshot.docs.map(item=>({id:item.id,...item.data()} as DateException))}
export async function getCalendarDays(fromKey:string,toKey:string){
  const range=[where(documentId(),">=",fromKey),where(documentId(),"<=",toKey)];
  const[availabilitySnapshot,exceptionSnapshot]=await Promise.all([
    getDocs(query(collection(db,"publicAvailability"),...range)),
    getDocs(query(collection(db,"exceptions"),...range)),
  ]);
  const days:Record<string,{occupied:Record<string,boolean>;exception:DateException|null}>={};
  availabilitySnapshot.docs.forEach(item=>{
    const data=item.data() as PublicAvailability;
    const keys=Array.isArray(data.occupiedSlotKeys)
      ?data.occupiedSlotKeys
      :Object.entries(data.occupiedSlots??{}).filter(([,value])=>value===true).map(([key])=>key);
    days[item.id]={occupied:Object.fromEntries(keys.map(key=>[key,true])),exception:null};
  });
  exceptionSnapshot.docs.forEach(item=>{
    const current=days[item.id];
    days[item.id]={occupied:current?.occupied??{},exception:{id:item.id,...item.data()} as DateException};
  });
  return days;
}
export async function saveException(dateKey:string,value:Omit<DateException,"id">){await setDoc(doc(db,"exceptions",dateKey),{closed:value.closed,...(value.customPeriods?.length?{customPeriods:value.customPeriods}:{}),...(value.reason?.trim()?{reason:value.reason.trim()}:{}),updatedAt:serverTimestamp()})}
export async function removeException(dateKey:string){await deleteDoc(doc(db,"exceptions",dateKey))}

export async function createInitialBusinessData(){
  const batch=writeBatch(db);
  const weeklySchedule={
    sunday:[],
    monday:[{start:"08:00",end:"12:00"},{start:"14:00",end:"19:00"}],
    tuesday:[{start:"08:00",end:"12:00"},{start:"14:00",end:"19:00"}],
    wednesday:[{start:"08:00",end:"12:00"},{start:"14:00",end:"19:00"}],
    thursday:[{start:"08:00",end:"12:00"},{start:"14:00",end:"19:00"}],
    friday:[{start:"08:00",end:"12:00"},{start:"14:00",end:"19:00"}],
    saturday:[{start:"08:00",end:"14:00"}],
  };
  batch.set(doc(db,"settings","public"),{businessName:"Barbearia Exemplo",publicPhone:"81999999999",timezone:"America/Recife",slotIntervalMinutes:30,minimumNoticeMinutes:60,bookingAdvanceDays:30,weeklySchedule,updatedAt:serverTimestamp()});
  const services=[
    {id:"corte-tradicional",name:"Corte tradicional",description:"Corte clássico com acabamento",durationMinutes:30,priceCents:3500,active:true,sortOrder:1},
    {id:"degrade",name:"Degradê",description:"Degradê com acabamento",durationMinutes:45,priceCents:4500,active:true,sortOrder:2},
    {id:"barba",name:"Barba",description:"Modelagem e acabamento",durationMinutes:30,priceCents:3000,active:true,sortOrder:3},
    {id:"corte-e-barba",name:"Corte e barba",description:"Experiência completa",durationMinutes:60,priceCents:6000,active:true,sortOrder:4},
  ];
  services.forEach(({id,...service})=>batch.set(doc(db,"services",id),{...service,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await batch.commit();
  settingsCache=null;
  servicesCache=null;
}
