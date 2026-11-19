import {toCSV} from './benchmark-core.mjs';
const KEY='qrt-benchmark-results-v1';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function createStore(){
 let db=null;
 if('indexedDB' in globalThis){
  try{db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open('qrt-benchmark-lab',1);
   req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('runs'))req.result.createObjectStore('runs',{keyPath:'id'});};
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });}catch(e){console.warn('IndexedDB nicht verfügbar',e);}
 }
 let rows=[];
 async function load(){
  if(db)try{
   rows=await new Promise((resolve,reject)=>{
    const tx=db.transaction('runs','readonly'),req=tx.objectStore('runs').getAll();
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });return rows;
  }catch(e){console.warn('IndexedDB kann nicht gelesen werden',e);}
  try{rows=JSON.parse(localStorage.getItem(KEY)||'[]');}catch{rows=[];}
  return rows;
 }
 async function save(row){
  rows.push(row);
  if(rows.length>500)rows=rows.slice(-500);
  if(db)try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('runs','readwrite');
    tx.objectStore('runs').put(row);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });return;
  }catch(e){console.warn('IndexedDB konnte nicht schreiben',e);}
  try{localStorage.setItem(KEY,JSON.stringify(rows));}
  catch(e){throw Error('Lokaler Speicher ist voll oder deaktiviert.');}
 }
 async function clear(){
  if(db)try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('runs','readwrite');tx.objectStore('runs').clear();
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });
  }catch(e){console.warn('IndexedDB konnte nicht gelöscht werden',e);}
  rows=[];try{localStorage.removeItem(KEY);}catch{}
 }
 await load();
 return {get rows(){return [...rows];},save,clear};
}
function download(name,data,type){
 const blob=new Blob([data],{type}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.download=name;a.href=url;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);
}
export function exportRuns(kind,runs){
 if(!runs.length)throw Error('Noch keine Ergebnisse vorhanden.');
 const rows=[...runs].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 const name='qr-turbo-benchmark-'+new Date().toISOString().slice(0,10);
 if(kind==='json')return download(name+'.json',JSON.stringify({app:'QR Turbo Benchmark Lab',
  generatedAt:new Date().toISOString(),runs:rows},null,2),'application/json');
 if(kind==='csv')return download(name+'.csv','\ufeff'+toCSV(rows),'text/csv;charset=utf-8');
 if(kind==='log')return download(name+'.log',rows.map(row=>JSON.stringify(row)).join('\n')+'\n','text/plain');
 if(kind==='html'){
  const body=rows.map(r=>'<tr><td>'+escape(r.createdAt)+'</td><td>'+escape(r.status)+
   '</td><td>'+escape(r.config?.grid)+'</td><td>'+escape(r.config?.fps)+'</td>'+
   '<td>'+escape(r.metrics?.codecMiBs?.toFixed(3)??'—')+'</td><td>'+
   escape(r.metrics?.sha256Verified?'SHA-256 OK':'nicht verifiziert')+'</td></tr>').join('');
  const report='<!doctype html><html lang="de"><head><meta charset="utf-8">'+
    '<title>QR Turbo Benchmark</title><style>body{background:#081114;color:#ecf5e9;font:15px system-ui;padding:25px}'+
    'h1{color:#c8f56f}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #49604e}'+
    'th{background:#1d3826;text-align:left}</style></head><body><h1>QR Turbo Benchmark Report</h1>'+
    '<p>Gemessener Codec-Durchsatz, keine Messung des optischen Goodputs.</p>'+
    '<table><tr><th>Zeit</th><th>Status</th><th>QR</th><th>Ziel-FPS</th><th>Codec MiB/s</th><th>Datei-Integrität</th></tr>'+
    body+'</table></body></html>';
  return download(name+'.html',report,'text/html;charset=utf-8');
 }
 throw Error('Unbekanntes Exportformat');
}
