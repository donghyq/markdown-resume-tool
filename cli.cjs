#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {render} = require('./src/core.cjs');
const HELP = `Markdown 简历 → HTML / PDF

用法：node cli.cjs input.md [--html output.html] [--pdf output.pdf]
      [--font-size 9.8] [--line-height 1.43] [--margin 12] [--accent '#234b66']

不指定输出时，在输入旁生成同名 HTML。
HTML 转换不需要安装依赖。直接生成 PDF 需要：
  npm install
  npx playwright install chromium
自动检测本机 Chrome / Edge；未安装浏览器时执行上述 Chromium 安装命令。
也可设置 RESUME_CHROMIUM_PATH 为本机 Chrome / Chromium 可执行文件路径。
`;
async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help') || args.includes('-h')) {console.log(HELP);return;}
  const input = args.shift(); const flags = {};
  const allowed = new Set(['--html','--pdf','--font-size','--line-height','--margin','--accent']);
  while (args.length) {const flag=args.shift();if(!allowed.has(flag)||!args.length||args[0].startsWith('--'))throw new Error('参数无效：'+flag+'，运行 --help 查看用法。');flags[flag]=args.shift();}
  for (const [flag,min,max] of [['--font-size',8,13],['--line-height',1.25,1.9],['--margin',9,20]]) {
    if(flags[flag]!==undefined && (!Number.isFinite(Number(flags[flag]))||Number(flags[flag])<min||Number(flags[flag])>max)) throw new Error(`${flag} 必须在 ${min} 至 ${max} 之间。`);
  }
  if(flags['--accent'] && !/^#[0-9a-f]{6}$/i.test(flags['--accent'])) throw new Error('--accent 使用 #234b66 形式的颜色。');
  const inputPath=path.resolve(input);
  const htmlPath=path.resolve(flags['--html'] || input.replace(/\.(md|markdown|txt)$/i,'')+'.html');
  const pdfPath=flags['--pdf'] ? path.resolve(flags['--pdf']) : null;
  if(htmlPath===inputPath || pdfPath===inputPath || pdfPath===htmlPath) throw new Error('输入、HTML 和 PDF 的路径必须不同。');
  const html=render(fs.readFileSync(inputPath,'utf8'),{fontSize:flags['--font-size'],lineHeight:flags['--line-height'],margin:flags['--margin'],accent:flags['--accent']});
  fs.mkdirSync(path.dirname(htmlPath),{recursive:true}); fs.writeFileSync(htmlPath,html);console.log('HTML：'+htmlPath);
  if (!pdfPath) return;
  let chromium;
  try {({chromium}=require('playwright'));}catch{throw new Error('HTML 已生成。PDF 需要 Playwright，请在工具目录运行 npm install，然后运行 npx playwright install chromium。');}
  const candidates=process.platform==='darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : process.platform==='win32' ? [path.join(process.env.PROGRAMFILES || 'C:\\Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)','Microsoft/Edge/Application/msedge.exe')] : ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'];
  const executablePath=process.env.RESUME_CHROMIUM_PATH || candidates.find(file=>fs.existsSync(file));
  const browser = await chromium.launch({headless:true,...(executablePath ? {executablePath} : {})});
  try {
    const page=await browser.newPage({viewport:{width:1000,height:1200}});
    await page.emulateMedia({media:'print'});
    await page.goto(pathToFileURL(htmlPath).href);
    await page.waitForFunction(()=>window.__resumeReady===true);
    const result=await page.evaluate(()=>window.__resumeResult);
    if(result.oversized) throw new Error('HTML 已生成，但有单个段落超过一页。请拆成短段或列表后再导出 PDF。');
    fs.mkdirSync(path.dirname(pdfPath),{recursive:true});
    await page.pdf({path:pdfPath,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:0,right:0,bottom:0,left:0}});
    console.log(`PDF：${pdfPath}（${result.pages} 页 A4）`);
  } finally {await browser.close();}
}
main().catch(error=>{console.error('导出失败：'+error.message);process.exitCode=1;});
