import { eq, desc } from "drizzle-orm";
import { contracts, contractDocusignEnvelopes, type ContractDocusignEnvelope } from "../drizzle/schema";
import { getDb, getContractById } from "./db";
import { DocusignError } from "./contractDocusignConfig";
export type EnvelopeRow = ContractDocusignEnvelope;
export type ContractSource = { id:number; contractCode:string; clientName:string; status:string; docUrl:string|null; country?:string|null; contractValue?:string; originalContractValueEur?:string|null; netContractValueEur?:string|null; discountValue?:string|null; currency?:string };
export interface LedgerSession {
  list(contractId:number):Promise<EnvelopeRow[]>;
  get(id:string):Promise<EnvelopeRow|null>;
  byRequest(requestId:string):Promise<EnvelopeRow|null>;
  insert(row:EnvelopeRow):Promise<void>;
  patch(id:string,patch:Partial<EnvelopeRow>):Promise<EnvelopeRow>;
}
export interface DocusignStore extends LedgerSession {
  contract(id:number):Promise<ContractSource|null>;
  withContractLock<T>(id:number,fn:(source:ContractSource,ledger:LedgerSession)=>Promise<T>):Promise<T>;
  withEnvelopeLock<T>(id:string,fn:(row:EnvelopeRow,ledger:LedgerSession)=>Promise<T>):Promise<T>;
  withSigningLock?<T>(id:string,fn:(row:EnvelopeRow,source:ContractSource,ledger:LedgerSession)=>Promise<T>):Promise<T>;
}
const sourceColumns={id:contracts.id,contractCode:contracts.contractCode,clientName:contracts.clientName,status:contracts.status,docUrl:contracts.docUrl,country:contracts.country,contractValue:contracts.contractValue,originalContractValueEur:contracts.originalContractValueEur,netContractValueEur:contracts.netContractValueEur,discountValue:contracts.discountValue,currency:contracts.currency};
function session(db:any):LedgerSession {
  const get=async(id:string)=>(await db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id,id)).limit(1))[0]??null;
  return {
    get,
    list:id=>db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.contractId,id)).orderBy(desc(contractDocusignEnvelopes.version)),
    byRequest:async id=>(await db.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.requestId,id)).limit(1))[0]??null,
    insert:async row=>{await db.insert(contractDocusignEnvelopes).values(row);},
    patch:async(id,values)=>{await db.update(contractDocusignEnvelopes).set(values).where(eq(contractDocusignEnvelopes.id,id));const row=await get(id);if(!row)throw new DocusignError("ENVELOPE_UNAVAILABLE");return row;},
  };
}
async function database(){const db=await getDb();if(!db)throw new DocusignError("DATABASE_UNAVAILABLE");return db;}
export const docusignStore:DocusignStore={
  contract:async id=>{const source=await getContractById(id);return source?{...source,country:source.country??"spain"}:null;},
  get:async id=>session(await database()).get(id),
  list:async id=>session(await database()).list(id),
  byRequest:async id=>session(await database()).byRequest(id),
  insert:async row=>session(await database()).insert(row),
  patch:async(id,values)=>session(await database()).patch(id,values),
  withContractLock:async(id,fn)=>(await database()).transaction(async tx=>{
    const[source]=await tx.select(sourceColumns).from(contracts).where(eq(contracts.id,id)).limit(1).for("update");
    if(!source)throw new DocusignError("CONTRACT_UNAVAILABLE");
    return fn({...source,country:source.country??"spain"},session(tx));
  }),
  withEnvelopeLock:async(id,fn)=>(await database()).transaction(async tx=>{
    const[row]=await tx.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id,id)).limit(1).for("update");
    if(!row)throw new DocusignError("ENVELOPE_UNAVAILABLE");return fn(row,session(tx));
  }),
  withSigningLock:async(id,fn)=>(await database()).transaction(async tx=>{
    // Match prepare/completion's contract-before-envelope ordering; one connection.
    const[identity]=await tx.select({contractId:contractDocusignEnvelopes.contractId}).from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id,id)).limit(1);
    if(!identity)throw new DocusignError("ENVELOPE_UNAVAILABLE");
    const[source]=await tx.select(sourceColumns).from(contracts).where(eq(contracts.id,identity.contractId)).limit(1).for("update");
    const[row]=await tx.select().from(contractDocusignEnvelopes).where(eq(contractDocusignEnvelopes.id,id)).limit(1).for("update");
    if(!row||!source||row.contractId!==source.id)throw new DocusignError("ENVELOPE_UNAVAILABLE");
    return fn(row,{...source,country:source.country??"spain"},session(tx));
  }),
};
