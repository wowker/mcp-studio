const original=process.kill;
const start=performance.now();
process.kill=function(pid,signal){
 try{const value=original.call(process,pid,signal);if(pid<0&&signal!==0)process.stderr.write(JSON.stringify({diagnostic:'owned_group_signal',caller:process.pid,group:-pid,signal,elapsedMs:performance.now()-start,result:'sent'})+'\n');return value;}
 catch(error){if(pid<0)process.stderr.write(JSON.stringify({diagnostic:'owned_group_signal',caller:process.pid,group:-pid,signal,elapsedMs:performance.now()-start,result:'error',code:error.code})+'\n');throw error;}
};
