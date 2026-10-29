const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const res=[];
 for(const w of [320,360,390]){
  const ctx=await b.newContext({viewport:{width:w,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{localStorage.setItem('IFS_BACKEND_URL','http://localhost:8765/exec');});
  const a=await ctx.newPage();
  await a.goto('http://localhost:8765/admin.html'); await a.waitForTimeout(600);
  await a.evaluate(()=>sessionStorage.setItem('IFS_ADMIN',JSON.stringify({token:'tok',email:'adm@ifs.edu.br'})));
  await a.reload(); await a.waitForTimeout(1800);
  await a.evaluate(()=>irPara('config')); await a.waitForTimeout(1800);
  const r=await a.evaluate(()=>{
    const tb=document.querySelector('.lista-admins tbody');
    ['prof.welkson@ifs.edu.br','prof.vitor@ifs.edu.br','coordenacao.muito.longa.do.campus@ifs.edu.br'].forEach(e=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${e}</td><td class="acoes"><button class="btn-link perigo">Remover</button></td>`;tb.appendChild(tr);});
    const card=document.querySelector('.lista-admins').closest('section'); const cb=card.getBoundingClientRect();
    const fora=[...card.querySelectorAll('td,button')].filter(e=>e.getBoundingClientRect().right>cb.right+1).length;
    return {fora, scroll:document.documentElement.scrollWidth, vw:innerWidth};});
  res.push([w,JSON.stringify(r)]);
  await a.locator('.lista-admins').scrollIntoViewIfNeeded(); await a.screenshot({path:'adm_cfg_'+w+'.png'});
  await ctx.close();
 }
 console.log(res.join('\n')); await b.close();
})();
