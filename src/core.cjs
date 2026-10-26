(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../vendor/marked.cjs'), require('node:fs').readFileSync(require('node:path').join(__dirname,'reference.css'),'utf8'));
  else root.Resume = factory(root.marked, root.ResumeReferenceCSS);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (marked, referenceCSS) {
  'use strict';
  // CommonMark's punctuation boundary treats **背景：**中文 as literal text.
  // Support this common Chinese résumé label while leaving code spans untouched.
  const markdownParser = new marked.Marked({gfm:true});
  markdownParser.use({extensions:[{
    name:'cjkStrong',level:'inline',
    start(src) {return src.indexOf('**');},
    tokenizer(src) {
      const match=/^\*\*([^*\n]+\p{P})\*\*(?=[\p{L}\p{N}])/u.exec(src);
      if(match && /[\u3400-\u9fff]/.test(match[1])) return {type:'cjkStrong',raw:match[0],text:match[1],tokens:this.lexer.inlineTokens(match[1])};
    }
  }]});
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
  function options(input = {}) {
    return {fontSize: bounded(input.fontSize, 9.8, 8, 13), lineHeight: bounded(input.lineHeight, 1.43, 1.25, 1.9), margin: bounded(input.margin, 12, 9, 20), accent: /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent : '#234b66'};
  }
  function safeHref(href) {
    // Accept explicit safe schemes and local document anchors; never load resources.
    const value = String(href || '').trim();
    return /^(https?:\/\/|mailto:|tel:|#)/i.test(value) && !/[\u0000-\u0020\u007f]/.test(value) ? value : '';
  }
  function inline(tokens = []) {
    return tokens.map(t => {
      switch (t.type) {
        case 'strong': case 'cjkStrong': return `<strong>${inline(t.tokens)}</strong>`;
        case 'em': return `<em>${inline(t.tokens)}</em>`;
        case 'del': return `<del>${inline(t.tokens)}</del>`;
        case 'codespan': return `<code>${escape(t.text)}</code>`;
        case 'br': return '<br>';
        case 'link': {const href = safeHref(t.href); return href ? `<a href="${escape(href)}" rel="noopener noreferrer">${inline(t.tokens)}</a>` : inline(t.tokens);}
        case 'image': return `<span class="image-alt">[图片：${escape(t.text || '未命名')}]</span>`;
        default: return t.tokens ? inline(t.tokens) : escape(t.text || t.raw || '');
      }
    }).join('');
  }
  function blocks(tokens) {
    return tokens.map(t => {
      switch (t.type) {
        case 'space': return '';
        case 'heading': {
          const level = Math.max(2, Math.min(6, t.depth));
          const split = t.depth === 3 ? t.text.lastIndexOf(' | ') : -1;
          if (split >= 0) return `<h3 class="dated"><span>${inline(markdownParser.lexer(t.text.slice(0, split))[0].tokens)}</span><time>${escape(t.text.slice(split + 3))}</time></h3>`;
          return `<h${level}>${inline(t.tokens)}</h${level}>`;
        }
        case 'paragraph': return `<p>${inline(t.tokens)}</p>`;
        case 'text': return `<p>${t.tokens ? inline(t.tokens) : escape(t.text)}</p>`;
        case 'blockquote': return `<blockquote>${blocks(t.tokens)}</blockquote>`;
        case 'list': return `<${t.ordered ? 'ol' : 'ul'}${t.ordered ? ` start="${Number(t.start) || 1}"` : ''}>${t.items.map(i => `<li>${i.task ? (i.checked ? '☑ ' : '☐ ') : ''}${blocks(i.tokens)}</li>`).join('')}</${t.ordered ? 'ol' : 'ul'}>`;
        case 'code': return `<pre><code>${escape(t.text)}</code></pre>`;
        case 'table': return `<table><thead><tr>${t.header.map(c=>`<th>${inline(c.tokens)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r=>`<tr>${r.map(c=>`<td>${inline(c.tokens)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
        case 'hr': return '<div class="page-break" data-page-break></div>';
        case 'html': return /^\s*<!--\s*pagebreak\s*-->\s*$/i.test(t.raw) ? '<div class="page-break" data-page-break></div>' : `<p class="literal-html">${escape(t.raw)}</p>`;
        default: return `<p>${escape(t.raw || '')}</p>`;
      }
    }).join('\n');
  }
  function resumeBlocks(tokens) {
    let html='', section='';
    const meaningful=tokens.filter(t=>t.type!=='space');
    const format=text=>inline(markdownParser.lexer(text)[0]?.tokens || []);
    const labels=html=>html.replace(/<li>(?:<p>)?<strong>/g,'<li><strong class="item-label">').replace(/<li><p>/g,'<li>').replace(/<\/p><\/li>/g,'</li>');
    for(let i=0;i<meaningful.length;i++) {
      const t=meaningful[i];
      if(t.type==='heading' && t.depth===2){section=t.text;html+=`<h2 class="section-title">${inline(t.tokens)}</h2>`;continue;}
      if(t.type==='heading' && t.depth===3) {
        const dateIndex=t.text.lastIndexOf(' | ');
        const title=dateIndex<0?t.text:t.text.slice(0,dateIndex);
        const date=dateIndex<0?'':t.text.slice(dateIndex+3);
        const numbered=/^(\d{1,2})[ .·、]+(.+)$/.exec(title);
        if(numbered) {
          const number=numbered[1].padStart(2,'0'); let stack='';
          if(meaningful[i+1]?.type==='blockquote') stack=meaningful[++i].text;
          let inner=''; let firstParagraph=true;
          while(i+1<meaningful.length) {
            const next=meaningful[i+1];
            if(next.type==='heading'&&next.depth<=3 || next.type==='hr' || next.type==='html'&&/pagebreak/.test(next.raw))break;
            i++;
            if(next.type==='paragraph'&&firstParagraph){inner+=`<p class="project-context">${inline(next.tokens)}</p>`;firstParagraph=false;}
            else if(next.type==='list'){inner+=labels(blocks([next])).replace(/^<(ul|ol)/,'<$1 class="contributions"');}
            else inner+=blocks([next]);
          }
          html+=`<article class="project" data-project="${number}"><div class="project-heading"><span class="project-number" aria-hidden="true">${number}</span><h3>${format(numbered[2])}</h3></div><div class="project-meta"><span>${format(stack)}</span><time>${escape(date)}</time></div>${inner}</article>`;
        } else if(dateIndex>=0) {
          const parts=title.split(' · ');
          html+=`<div class="entry-line"><p><strong>${format(parts[0])}</strong>${parts.length>1?`<span class="detail">${format(/工作/.test(section)?parts[1]:parts.slice(1).join(' · '))}</span>`:''}${/工作/.test(section)&&parts.length>2?`<span class="inline-role">${format(parts.slice(2).join(' · '))}</span>`:''}</p><time>${escape(date)}</time></div>`;
        } else html+=`<h3 class="generic-heading">${inline(t.tokens)}</h3>`;
      } else if(t.type==='paragraph') html+=`<p class="${/工作/.test(section)?'work-description':/教育/.test(section)?'awards':'plain-p'}">${inline(t.tokens)}</p>`;
      else if(t.type==='list') html+=labels(blocks([t])).replace(/^<(ul|ol)/,`<$1 class="${/技术|技能/.test(section)?'skills-list':'generic-list'}"`);
      else html+=blocks([t]);
    }
    return html;
  }
  function parse(markdown) {
    const tokens = markdownParser.lexer(String(markdown).replace(/^\uFEFF/, ''));
    const index = tokens.findIndex(t => t.type === 'heading' && t.depth === 1);
    let name = '个人简历', identity = '', role = '';
    if (index >= 0) {
      const title = tokens.splice(index, 1)[0]; name = title.text.replace(/[*_`]/g, '').trim() || name;
      identity = `<header class="identity"><div class="identity-main"><h1>${inline(title.tokens)}</h1>`;
      // Optional role quote and contacts immediately after the name.
      while (tokens[index]?.type === 'space') tokens.splice(index, 1);
      if (tokens[index]?.type === 'blockquote') {const quote=tokens.splice(index,1)[0];role=quote.text;identity += `<p class="identity-role role">${inline(markdownParser.lexer(quote.text)[0]?.tokens || [])}</p>`;}
      identity += '</div>';
      while (tokens[index]?.type === 'space') tokens.splice(index, 1);
      if (tokens[index]?.type === 'paragraph') {
        const contact=tokens.splice(index,1)[0];
        function contactPart(part){const label=/^(电话|邮箱|出生日期|城市|网站)[：: ]+/.exec(part);return label?`<span class="contact-label">${escape(label[1])}</span>${inline(markdownParser.lexer(part.slice(label[0].length))[0]?.tokens || [])}`:inline(markdownParser.lexer(part)[0]?.tokens || []);}
        identity += `<div class="contacts">${contact.text.split(/ \| | · /).map(part=>`<span class="contact">${contactPart(part)}</span>`).join('')}</div>`;
      }
      identity += '</header>';
    }
    return {name, role, body: identity + resumeBlocks(tokens)};
  }
  function css(input) {
    const o = options(input);
    return referenceCSS + `
:root{--accent:${o.accent};--body-size:${o.fontSize}pt;--body-leading:${o.lineHeight};--size:${o.fontSize}pt;--margin:${o.margin}mm}
.papers{width:210mm;margin:24px auto}.resume-page{height:297mm;padding:${o.margin*9.5/12}mm ${o.margin}mm ${o.margin*9/12}mm}.page-content{min-height:0}.page-two{--body-leading:${o.lineHeight+0.25};--item-gap:8pt}.page-footer{flex-shrink:0}.page-footer span:first-child{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.page-footer span:last-child{white-space:nowrap}.section-title{margin-top:7.5pt}.page-two .section-title{margin-top:16pt}.heading-group{display:flow-root}.project-heading-unit{break-inside:avoid}.entry-line{margin-top:0}.entry-line p{margin:0}.plain-p{margin:3pt 0 5pt}.contributions li p,.skills-list li p{margin:0}.generic-list{padding-left:13pt;margin:3pt 0 6pt}.generic-list li{margin-bottom:var(--item-gap);break-inside:avoid}.generic-list li:last-child{margin-bottom:0}.generic-heading{font-size:11pt;margin:7pt 0 4pt}.resume-page.oversize{height:auto;min-height:297mm}.warning{color:#91601a}.toolbar button{border:0;border-radius:6px;background:var(--accent);color:white;padding:9px 16px;cursor:pointer}blockquote{border-left:2px solid var(--line);padding-left:9pt;color:var(--muted);margin:5pt 0 7pt}code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:#f2f5f7;border-radius:3px;padding:1px 3px}pre{white-space:pre-wrap;margin:5pt 0;padding:8pt;background:#f3f5f7;font-size:8pt}table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:9pt}th,td{padding:4pt;border:1px solid var(--line);text-align:left}.image-alt{color:var(--muted)}
@media print{.resume-page{padding:${o.margin*9.5/12}mm ${o.margin}mm ${o.margin*9/12}mm}.resume-page.oversize{height:auto}.heading-group{break-inside:avoid}}
`;
  }
  // Used in both the standalone export and the editor preview. No Markdown scripts execute.
  function paginate() {
    const source = document.getElementById('resume-source');
    const host = document.getElementById('papers');
    const name = document.body.dataset.name || '个人简历';
    let units = [];
    for (const node of Array.from(source.children)) {
      if ((node.tagName === 'UL' || node.tagName === 'OL') && node.children.length > 1) {
        // Keep each bullet intact and retain numbering when a list crosses a page.
        Array.from(node.children).forEach((li, index) => {
          const list = node.cloneNode(false);
          if (node.tagName === 'OL') list.start = (node.start || 1) + index;
          list.append(li); list.style.marginBottom = 'var(--item-gap)'; units.push(list);
        });
      } else units.push(node);
    }
    // A section or project title stays with its first paragraph / contribution.
    const groups = [];
    for (let i = 0; i < units.length; i++) {
      if (/^H[2-6]$/.test(units[i].tagName) || units[i].classList.contains('entry-line')) {
        const group = document.createElement('div'); group.className = 'heading-group';
        group.append(units[i]);
        while (i + 1 < units.length && /^H[2-6]$/.test(units[i + 1].tagName)) group.append(units[++i]);
        if (i + 1 < units.length && !units[i + 1].hasAttribute('data-page-break')) group.append(units[++i]);
        if(group.lastElementChild?.classList.contains('entry-line') && units[i+1]?.tagName==='P')group.append(units[++i]);
        groups.push(group);
      } else groups.push(units[i]);
    }
    const pages = []; let page, content; let oversized = 0;
    function createPage() {
      page = document.createElement('section'); page.className = 'paper resume-page '+(pages.length ? 'page-two' : 'page-one');
      content = document.createElement('div'); content.className = 'page-content';
      const footer = document.createElement('footer'); footer.className = 'page-footer';
      const label = document.createElement('span'); label.textContent = name+(document.body.dataset.role ? ' · '+document.body.dataset.role : '');
      const count=document.createElement('span');count.className='page-count';footer.append(label,count); page.append(content, footer); host.append(page); pages.push(page);
      if(pages.length>1){const continuation=document.createElement('div');continuation.className='continuation';const person=document.createElement('strong');person.textContent=name;const caption=document.createElement('span');caption.textContent=(document.body.dataset.role || '个人简历')+' · 续页';continuation.append(person,caption);content.append(continuation);}
    }
    function fits() { return content.scrollHeight <= content.clientHeight + 1; }
    createPage();
    for (const unit of groups) {
      if (unit.hasAttribute('data-page-break')) {if (Array.from(content.children).some(n=>!n.classList.contains('continuation'))) createPage(); continue;}
      // Do not append to an exceptionally tall block's page.
      if (page.classList.contains('oversize')) createPage();
      content.append(unit);
      if (!fits() && Array.from(content.children).filter(n=>!n.classList.contains('continuation')).length > 1) {unit.remove(); createPage(); content.append(unit);}
      if (!fits()) {page.classList.add('oversize'); oversized++;}
    }
    if (!Array.from(content.children).some(n=>!n.classList.contains('continuation')) && pages.length > 1) {page.remove(); pages.pop();}
    pages.forEach((p,i) => {p.setAttribute('aria-label', `简历第 ${i + 1} 页`); p.querySelector('.page-footer span:last-child').textContent = `${String(i + 1).padStart(2, '0')} / ${String(pages.length).padStart(2, '0')}`;});
    source.remove();
    const warning = oversized ? '有单个段落超出一页，请拆成短段或列表后导出。' : '';
    document.getElementById('page-status').textContent = `${pages.length} 页 A4${warning ? ' · ' + warning : ''}`;
    document.getElementById('page-status').classList.toggle('warning', !!warning);
    window.__resumeResult = {pages:pages.length, oversized, warning}; window.__resumeReady = true;
    parent.postMessage({type:'resume-ready', result:window.__resumeResult}, '*');
  }
  function render(markdown, input = {}) {
    const parsed = parse(markdown);
    const script = `(${paginate.toString()})();`;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="referrer" content="no-referrer"><title>${escape(parsed.name)} · 简历</title><style>${css(input)}</style></head><body data-name="${escape(parsed.name)}" data-role="${escape(parsed.role)}"><div class="toolbar"><span id="page-status">正在排版…</span><button type="button" id="print">打印 / 导出 PDF</button></div><main class="papers" id="papers"></main><div id="resume-source" style="display:none">${parsed.body}</div><script>document.getElementById('print').onclick=()=>window.print();document.fonts.ready.then(()=>{${script}});<\/script></body></html>`;
  }
  return {parse, render, options, safeHref};
});
