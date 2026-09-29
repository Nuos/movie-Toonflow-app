(function(root){
  function summarize(tables){
    let shots=0,total=0,invalid=0;const segments=[];
    for(const rows of tables){
      const header=rows.findIndex(row=>row.some(cell=>/^时长(?:[（(].*[)）])?$/.test(cell.trim())));
      if(header<0)continue;
      const column=rows[header].findIndex(cell=>/^时长(?:[（(].*[)）])?$/.test(cell.trim()));
      let duration=0,count=0;
      for(const row of rows.slice(header+1)){
        if(!/^\d+$/.test((row[0]||'').trim()))continue;
        shots++;count++;
        const match=(row[column]||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:秒|s)?$/i);
        if(!match||Number(match[1])<=0){invalid++;continue;}
        duration+=Number(match[1]);
      }
      if(count){segments.push(Math.round(duration*1000)/1000);total+=duration;}
    }
    return {shots,total:Math.round(total*1000)/1000,invalid,segments};
  }
  if(typeof module==='object'&&module.exports)module.exports={summarize};
  else root.ToonflowDurationSummary={summarize};
})(typeof window==='undefined'?globalThis:window);
