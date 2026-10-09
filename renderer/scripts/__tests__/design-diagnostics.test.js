const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const puppeteer = require('puppeteer');
const { inspectDesignLayout } = require('../design-diagnostics');

let browser;
before(async () => {
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] });
});
after(async () => { if (browser) await browser.close(); });
async function inspect(body) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 600 });
    await page.setContent(`<html><head><style>html,body{margin:0;width:800px;height:600px;font:20px Arial}p{margin:0}*{box-sizing:border-box}</style></head><body>${body}</body></html>`);
    return await page.evaluate(inspectDesignLayout);
  } finally { await page.close(); }
}
test('flags actual text outside the canvas at render size', async () => {
  const result = await inspect('<p style="position:absolute;left:760px;top:20px;white-space:nowrap">Approved paragraph</p>');
  assert.ok(result.issues.some(issue => issue.code === 'text_outside_canvas'));
  assert.equal(result.width, 800); assert.equal(result.height, 600);
});
test('detects text clipped by an ancestor container', async () => {
  const result = await inspect('<div style="width:90px;overflow:hidden"><p style="white-space:nowrap">A paragraph that will be clipped</p></div>');
  assert.ok(result.issues.some(issue => issue.code === 'clipped_text'));
});
test('detects cards covering approved paragraphs', async () => {
  const result = await inspect('<p style="position:absolute;top:100px;left:100px">Approved paragraph behind cards</p><div style="position:absolute;top:90px;left:90px;width:400px;height:70px;background:white"></div>');
  assert.ok(result.issues.some(issue => issue.code === 'covered_text'));
});

test('identifies both the approved paragraph and the card that must move in repair feedback', async () => {
  const result = await inspect('<span data-copy-id="copy-3" style="position:absolute;left:100px;top:100px">Approved paragraph behind cards</span><div id="benefit-grid" style="position:absolute;left:90px;top:90px;width:400px;height:70px;background:white"></div>');
  const issue = result.issues.find(issue => issue.code === 'covered_text');
  assert.equal(issue.element, 'copy-3');
  assert.match(issue.message, /benefit-grid/);
  assert.match(issue.message, /x=90, y=90, ancho=400, alto=70/);
});
test('ignores intentional background bleed and containing card backgrounds', async () => {
  const result = await inspect('<div style="position:absolute;left:-50px;top:-50px;width:900px;height:700px;background:navy"></div><div style="position:absolute;left:50px;top:50px;width:500px;height:120px;background:white;padding:20px"><p>Visible <strong>approved text</strong></p></div>');
  assert.deepEqual(result.issues, []);
});
test('detects overlapping text without opaque backgrounds', async () => {
  const result = await inspect('<p style="position:absolute;left:50px;top:50px">First paragraph</p><p style="position:absolute;left:60px;top:55px">Second paragraph</p>');
  assert.ok(result.issues.some(issue => issue.code === 'overlapping_text'));
});
test('detects hidden approved slots but ignores decorative hidden text', async () => {
  const result = await inspect('<div hidden>Decorative</div><p data-copy-id="copy_1" style="opacity:0">Approved paragraph</p>');
  assert.equal(result.issues.length, 1); assert.equal(result.issues[0].code, 'hidden_text');
});
test('reports broken assets without retrying intentionally empty artwork slots', async () => {
  const result = await inspect('<img id="pending" src="" alt="Artwork pending" width="80" height="80"><img id="broken" src="data:image/png;base64,broken" width="80" height="80">');
  assert.deepEqual(result.issues.filter(issue => issue.code === 'missing_image').map(issue => issue.element), ['broken']);
});
for (const style of ['display:none', 'visibility:hidden', 'opacity:0']) {
  test(`required copy remains detectable inside an ancestor with ${style}`, async () => {
    const result = await inspect(`<div style="${style}"><span data-copy-id="copy-1">Approved paragraph</span></div>`);
    assert.ok(result.issues.some(issue => issue.code === 'hidden_text' && issue.element === 'copy-1'));
  });
}
for (const style of ['font-size:0', 'display:inline-block;transform:scale(0)', 'position:absolute;clip:rect(0px,0px,0px,0px)', 'display:inline-block;clip-path:inset(100%)']) {
  test(`required copy with ${style} cannot pass review`, async () => {
    const result = await inspect(`<span data-copy-id="copy-1" style="${style}">Approved paragraph</span>`);
    assert.ok(result.issues.some(issue => ['hidden_text', 'clipped_text'].includes(issue.code) && issue.element === 'copy-1'));
  });
}
test('required copy with zero container height and clipped overflow cannot pass', async () => {
  const result = await inspect('<span data-copy-id="copy-1" style="display:block;width:0;height:0;overflow:hidden">Approved paragraph</span>');
  assert.ok(result.issues.some(issue => issue.code === 'clipped_text' && issue.element === 'copy-1'));
});
test('required copy outside the canvas or under a painted card cannot pass', async () => {
  const result = await inspect('<span data-copy-id="copy-1" style="position:absolute;left:-500px">Approved paragraph</span><span data-copy-id="copy-2" style="position:absolute;left:100px;top:100px">Other paragraph</span><div style="position:absolute;left:90px;top:90px;width:250px;height:100px;background:white"></div>');
  assert.ok(result.issues.some(issue => issue.code === 'text_outside_canvas' && issue.element === 'copy-1'));
  assert.ok(result.issues.some(issue => issue.code === 'covered_text' && issue.element === 'copy-2'));
});
test('visible required text may use a display:contents wrapper', async () => {
  const result = await inspect('<p><span data-copy-id="copy-1" style="display:contents">Approved paragraph</span></p>');
  assert.deepEqual(result.issues, []);
});
test('opaque noninteractive decoration cannot hide required copy and keeps its original style', async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 600 });
    await page.setContent('<span data-copy-id="copy-1" style="position:absolute;left:100px;top:100px;font-size:20px">Approved paragraph</span><div id="cover" style="position:absolute;left:90px;top:90px;width:250px;height:100px;background:white;pointer-events:none!important"></div>');
    const beforeStyle = await page.$eval('#cover', element => element.getAttribute('style'));
    const result = await page.evaluate(inspectDesignLayout);
    assert.ok(result.issues.some(issue => issue.code === 'covered_text' && issue.element === 'copy-1'));
    assert.equal(await page.$eval('#cover', element => element.getAttribute('style')), beforeStyle);
  } finally { await page.close(); }
});
