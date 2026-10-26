'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {parse, render, options} = require('../src/core.cjs');
test('保留中文姓名、角色、日期、列表与 Markdown 强调',()=>{
  const parsed=parse('# 林知远\n\n> 工程师\n\n[邮箱](mailto:lin@example.com)\n\n## 工作\n\n### 公司 | 2024 - 至今\n\n- **成果**：缩短延迟\n- 第二项');
  assert.equal(parsed.name,'林知远');
  assert.match(parsed.body,/<h1>林知远<\/h1>/);
  assert.match(parsed.body,/<p class="identity-role role">工程师/);
  assert.match(parsed.body,/<time>2024 - 至今<\/time>/);
  assert.match(parsed.body,/<strong class="item-label">成果<\/strong>/);
  assert.equal((parsed.body.match(/<li>/g)||[]).length,2);
});
test('原始 HTML 和危险链接不执行，图片不发起外部请求',()=>{
  const result=parse('# <img src=x onerror=alert(1)>\n\n<script>window.pwned=1</script>\n\n[x](javascript:alert%281%29)\n\n![头像](https://example.com/private.png)');
  assert.doesNotMatch(result.body,/<img|<script|href="javascript:/);
  assert.match(result.body,/&lt;script&gt;/);
  assert.match(result.body,/图片/);
});
test('中文标签后直接接正文时加粗仍然生效，代码内容不改写',()=>{
  const parsed=parse('**背景：**企业知识检索\n\n- **贡献：**实现检索\n\n`**背景：**文字`');
  assert.match(parsed.body,/<strong>背景：<\/strong>企业知识检索/);
  assert.match(parsed.body,/<strong class="item-label">贡献：<\/strong>实现检索/);
  assert.match(parsed.body,/<code>\*\*背景：\*\*文字<\/code>/);
});
test('显式分页仅支持 Markdown 分隔线和指定注释',()=>{
  const result=parse('内容一\n\n---\n\n内容二\n\n<!-- pagebreak -->\n\n内容三');
  assert.equal((result.body.match(/data-page-break/g)||[]).length,2);
});
test('HTML 参数限制范围，标题不能逃逸文档',()=>{
  const html=render('# </title><script>alert(1)</script>',{accent:'red;display:none',fontSize:100,margin:-1});
  assert.equal(options({fontSize:100,margin:-1}).fontSize,13);
  assert.equal(options({margin:-1}).margin,9);
  assert.match(html,/--accent:#234b66/);
  assert.doesNotMatch(html,/<title><\/title><script>/);
});
