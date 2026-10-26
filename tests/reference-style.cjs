'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {render}=require('../src/core.cjs');
async function main(){
  if(!process.argv[2])throw new Error('请传入参考 HTML 的文件路径。');
  const browser=await chromium.launch({headless:true,...(process.env.RESUME_CHROMIUM_PATH?{executablePath:process.env.RESUME_CHROMIUM_PATH}:{})});
  try{
    const original=await browser.newPage({viewport:{width:1200,height:1200}});await original.emulateMedia({media:'print'});
    await original.goto(pathToFileURL(path.resolve(process.argv[2])).href);await original.evaluate(()=>document.fonts.ready);
    const markdown=await original.locator('#project-3').evaluate(article=>{
      function md(node){if(node.nodeType===3)return node.textContent;if(node.tagName==='STRONG')return '**'+node.textContent+'**';return Array.from(node.childNodes).map(md).join('');}
      return '# 版式验证\n\n> 工程师\n\n占位信息\n\n---\n\n### '+article.querySelector('.project-number').textContent+' '+article.querySelector('h3').textContent+' | '+article.querySelector('time').textContent+'\n\n> '+article.querySelector('.project-meta span').textContent+'\n\n'+md(article.querySelector('.project-context')).trim()+'\n\n'+Array.from(article.querySelectorAll('li')).map(li=>'- '+md(li).trim()).join('\n');
    });
    const generated=await browser.newPage({viewport:{width:1200,height:1200}});await generated.emulateMedia({media:'print'});
    await generated.setContent(render(markdown));await generated.waitForFunction(()=>window.__resumeReady);
    const selectors=['.project-heading','.project-number','h3','.project-meta','.project-meta time','.project-context','.contributions','.contributions li','.item-label','.contributions strong:not(.item-label)'];
    const props=['font-family','font-size','font-weight','line-height','color','margin-top','margin-bottom','padding-left','gap','border-bottom-width'];
    async function collect(locator){return locator.evaluate((article,{selectors,props})=>Object.fromEntries(selectors.map(selector=>{const element=article.querySelector(selector);const style=getComputedStyle(element);return [selector,Object.fromEntries(props.map(prop=>[prop,style.getPropertyValue(prop)]))];})),{selectors,props});}
    assert.deepEqual(await collect(generated.locator('.project')),await collect(original.locator('#project-3')));
    const a=await original.locator('#project-3').boundingBox(),b=await generated.locator('.project').boundingBox();
    assert.ok(Math.abs(a.width-b.width)<.5);assert.ok(Math.abs(a.height-b.height)<.5,`项目高度 ${a.height} / ${b.height}`);
    // Only the de-identified sample preview is retained as a deliverable.
    await generated.goto(pathToFileURL(path.resolve(__dirname,'../examples/sample.html')).href);await generated.waitForFunction(()=>window.__resumeReady);
    await generated.locator('[data-project="03"]').screenshot({path:path.resolve(__dirname,'../output/preview-project03.png'),scale:'css'});
    console.log('PASS：参考项目区的 10 类元素、100 项样式与同内容尺寸一致；已生成脱敏预览。');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
