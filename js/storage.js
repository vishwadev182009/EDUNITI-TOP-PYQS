/* One small JSON database. IndexedDB is primary; localStorage is the fallback. */
window.Store = (()=>{
 const KEY='jeePhysicsTracker.v1', DB='jeePhysicsTracker', STORE='state'; let dbPromise;
 function defaults(){return {version:1,totals:{},records:{},sessions:[],questionBanks:{},lastBackupReminder:0,theme:'light'};}
 function openDB(){if(!('indexedDB'in window))return Promise.reject(); if(dbPromise)return dbPromise; dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return dbPromise;}
 async function load(){try{const db=await openDB();const val=await new Promise((res,rej)=>{const t=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);t.onsuccess=()=>res(t.result);t.onerror=()=>rej(t.error);});return val||defaults();}catch(e){try{return JSON.parse(localStorage.getItem(KEY))||defaults();}catch(_){return defaults();}}}
 async function save(data,options={}){try{const db=await openDB();await new Promise((res,rej)=>{const t=db.transaction(STORE,'readwrite');t.objectStore(STORE).put(data,KEY);t.oncomplete=res;t.onerror=()=>rej(t.error);});}catch(e){localStorage.setItem(KEY,JSON.stringify(data));}if(options.cloud!==false)window.CloudSync?.queue(data);}
 return {load,save};
})();
