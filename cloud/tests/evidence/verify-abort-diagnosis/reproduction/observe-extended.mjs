const original=process.kill;const start=performance.now();const pending=new Set();
process.kill=function(pid,signal){
 try{const value=original.call(process,pid,signal);if(pid<0&&signal!==0)process.stderr.write(JSON.stringify({diagnostic:'owned_group_signal',caller:process.pid,group:-pid,signal,elapsedMs:performance.now()-start,result:'sent'})+'\n');return value;}
 catch(error){if(pid<0){process.stderr.write(JSON.stringify({diagnostic:'owned_group_signal',caller:process.pid,group:-pid,signal,elapsedMs:performance.now()-start,result:'error',code:error.code})+'\n');if(signal===0&&error.code==='EPERM'&&!pending.has(pid)){pending.add(pid);let count=0;const observe=()=>{let code='present';try{original.call(process,pid,0);}catch(e){code=e.code;}process.stderr.write(JSON.stringify({diagnostic:'post_failure_probe',group:-pid,elapsedMs:performance.now()-start,result:code})+'\n');if(code!=='ESRCH'&&++count<8)setTimeout(observe,25);};setTimeout(observe,25);}}throw error;}
};
