'use strict';
// Requires the same optional Playwright dependency as direct PDF export.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {render} = require('../src/core.cjs');
const root=path.resolve(__dirname,'..');
async function main() {
  const executablePath=process.env.RESUME_CHROMIUM_PATH;
  const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
  try {
    const page=await browser.newPage({viewport:{width:1600,height:1050}});
    await page.context().addInitScript(()=>{window.print=()=>{window.__printCalled=true;};});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const requests=[];page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('实时预览'));
    assert.equal(await page.locator('#markdown').inputValue(),fs.readFileSync(path.join(root,'examples/sample.md'),'utf8'));
    assert.equal(await page.locator('#status').textContent(),'2 页 A4 · 实时预览');
    fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
    await page.screenshot({path:path.join(root,'tmp/editor-desktop.png'),fullPage:true});
    const popupPromise=page.waitForEvent('popup');await page.locator('#pdf').click();const printPage=await popupPromise;
    await printPage.waitForFunction(()=>window.__resumeReady && window.__printCalled);
    assert.equal(await printPage.locator('.resume-page').count(),2);assert.equal(await printPage.locator('textarea').count(),0);
    assert.doesNotMatch(await printPage.locator('.papers').textContent(),/\*\*背景/);
    await printPage.close();
    // Downloaded HTML is complete and independent of the editor / source directory.
    const downloadPromise=page.waitForEvent('download');await page.locator('#save-html').click();
    const download=await downloadPromise;const downloadedPath=path.join(root,'tmp/downloaded.html');await download.saveAs(downloadedPath);
    const exported=await browser.newPage();await exported.goto(pathToFileURL(downloadedPath).href);await exported.waitForFunction(()=>window.__resumeReady);
    assert.equal(await exported.locator('.resume-page').count(),2);assert.equal(await exported.locator('textarea').count(),0);
    const mdPromise=page.waitForEvent('download');await page.locator('#save-md').click();const mdDownload=await mdPromise;await mdDownload.saveAs(path.join(root,'tmp/downloaded.md'));
    assert.equal(fs.readFileSync(path.join(root,'tmp/downloaded.md'),'utf8'),fs.readFileSync(path.join(root,'examples/sample.md'),'utf8'));
    // File import and typography control both affect the live preview.
    await page.locator('#file-input').setInputFiles({name:'test.md',mimeType:'text/markdown',buffer:Buffer.from('# 测试姓名\n\n> 工程师\n\n## 项目\n\n- 测试导入')});
    await page.waitForFunction(()=>document.querySelector('#preview').srcdoc.includes('测试姓名'));
    await page.locator('#font-size').fill('11');await page.locator('#font-size').dispatchEvent('input');
    await page.waitForFunction(()=>document.querySelector('#preview').srcdoc.includes('--size:11pt'));
    await page.locator('#remember').check();await page.reload();assert.match(await page.locator('#markdown').inputValue(),/测试姓名/);
    await page.locator('#clear').click();assert.equal(await page.evaluate(()=>localStorage.getItem('markdown-resume-v1')),null);
    // Explicit confirmation protects current work when resetting the sample.
    await page.locator('#markdown').fill('待保留的内容');await page.locator('#sample').click();assert.equal(await page.locator('#replace-dialog').evaluate(el=>el.open),true);
    await page.locator('#cancel-sample').click();assert.equal(await page.locator('#markdown').inputValue(),'待保留的内容');
    await page.locator('#sample').click();await page.locator('#confirm-sample').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent==='2 页 A4 · 实时预览');
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'tmp/editor-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    // Stress automatic pagination without manual markers and preserve all bullet text.
    const bullets=Array.from({length:80},(_,i)=>`- 第 ${i+1} 项：`+'检索系统需要校验版本并记录处理结果。'.repeat(5)).join('\n');
    await exported.setContent(render('# 长简历\n\n## 项目\n\n### 项目一\n\n'+bullets));await exported.waitForFunction(()=>window.__resumeReady);
    const longResult=await exported.evaluate(()=>({result:window.__resumeResult,items:document.querySelectorAll('li').length,overflows:[...document.querySelectorAll('.page-content')].filter(p=>p.scrollHeight>p.clientHeight+1).length}));
    assert.ok(longResult.result.pages>2);assert.equal(longResult.items,80);assert.equal(longResult.overflows,0);
    // Raw HTML cannot run, nor can image Markdown contact a remote host.
    await exported.setContent(render('# 安全检查\n\n<script>window.pwned=1</script>\n\n![图](https://example.com/a.png)\n\n[x](javascript:alert%281%29)'));await exported.waitForFunction(()=>window.__resumeReady);
    assert.equal(await exported.evaluate(()=>window.pwned),undefined);assert.equal(await exported.locator('img').count(),0);
    // Oversized blocks are visible and produce a warning instead of being clipped.
    await exported.setContent(render('# 长段落\n\n## 正文\n\n'+'超长段落测试。'.repeat(3000)));await exported.waitForFunction(()=>window.__resumeReady);
    assert.ok((await exported.evaluate(()=>window.__resumeResult.oversized))>0);
    assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
    console.log('PASS：桌面/手机、离线下载、导入、设置、草稿、分页、内容安全；网络请求 0。');
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
