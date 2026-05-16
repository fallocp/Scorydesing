#!/usr/bin/env node

/**
 * render.test.js — Integration tests for Puppeteer render scripts
 *
 * Self-contained test script using Node.js built-in assert module.
 * Puppeteer-dependent tests are skipped if Puppeteer is not installed.
 *
 * Usage: node scripts/__tests__/render.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ─── Test infrastructure ────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let skippedTests = 0;
let failedTests = 0;
const failures = [];

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    if (err.message === '__SKIP__') {
      skippedTests++;
      console.log(`  ⏭️  ${name} (skipped)`);
    } else {
      failedTests++;
      failures.push({ name, error: err.message });
      console.log(`  ❌ ${name}`);
      console.log(`     ${err.message}`);
    }
  }
}

function skip(reason) {
  const err = new Error('__SKIP__');
  err.reason = reason;
  throw err;
}

// ─── Check Puppeteer availability ───────────────────────────────────────────

let puppeteerAvailable = false;
try {
  require('puppeteer');
  puppeteerAvailable = true;
} catch {
  // Puppeteer not installed
}

// ─── Paths ──────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, '..', '..');
const scriptsDir = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'output');
const testTmpDir = path.join(__dirname, '_tmp');

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a minimal test HTML file with given dimensions.
 */
function createTestHtml(filePath, width, height, bodyContent) {
  const content = bodyContent || `<h1 style="color:white;font-size:48px;">Test ${width}x${height}</h1>`;
  const html = `<!DOCTYPE html>
<html lang="en" style="width:${width}px;height:${height}px;margin:0;padding:0;">
<head><meta charset="UTF-8" /></head>
<body style="width:${width}px;height:${height}px;margin:0;padding:0;background:#0F1419;display:flex;align-items:center;justify-content:center;">
${content}
</body>
</html>`;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

/**
 * Check if a file is a valid PNG by reading its magic bytes.
 */
function isValidPng(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 8) return false;
  // PNG magic bytes: 137 80 78 71 13 10 26 10
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  );
}

/**
 * Extract PNG dimensions from IHDR chunk.
 * IHDR starts at byte 16 (after 8-byte signature + 4-byte length + 4-byte type).
 * Width is at bytes 16-19, height at bytes 20-23 (big-endian).
 */
function getPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

// ─── Import modules under test ──────────────────────────────────────────────

const { extractDimensions, generateOutputFilename } = require('../render');
let renderHtmlToPng, renderBatch, findHtmlFiles, cleanOutput;

// Always available (no Puppeteer needed for pure functions)
const { cleanOutput: cleanOutputFn } = require('../clean-output');
cleanOutput = cleanOutputFn;

// Conditionally load render functions that need Puppeteer at runtime
if (puppeteerAvailable) {
  renderHtmlToPng = require('../render').renderHtmlToPng;
  const batchModule = require('../render-batch');
  renderBatch = batchModule.renderBatch;
  findHtmlFiles = batchModule.findHtmlFiles;
} else {
  findHtmlFiles = require('../render-batch').findHtmlFiles;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🧪 Render Scripts — Integration Tests\n');

  // ── Unit tests for extractDimensions (no Puppeteer needed) ──

  console.log('📐 extractDimensions:');

  await test('extracts 1080x1080 from instagram-post style', () => {
    const html = '<html lang="es" style="width:1080px;height:1080px;margin:0;padding:0;">';
    const dims = extractDimensions(html);
    assert.strictEqual(dims.width, 1080);
    assert.strictEqual(dims.height, 1080);
  });

  await test('extracts 1080x1920 from instagram-story style', () => {
    const html = '<html lang="es" style="width:1080px;height:1920px;margin:0;padding:0;">';
    const dims = extractDimensions(html);
    assert.strictEqual(dims.width, 1080);
    assert.strictEqual(dims.height, 1920);
  });

  await test('extracts 1200x628 from facebook-post style', () => {
    const html = '<html style="width:1200px;height:628px;">';
    const dims = extractDimensions(html);
    assert.strictEqual(dims.width, 1200);
    assert.strictEqual(dims.height, 628);
  });

  await test('defaults to 1080x1080 when no style attribute', () => {
    const html = '<html lang="es"><head></head><body></body></html>';
    const dims = extractDimensions(html);
    assert.strictEqual(dims.width, 1080);
    assert.strictEqual(dims.height, 1080);
  });

  await test('defaults to 1080x1080 when style has no dimensions', () => {
    const html = '<html style="margin:0;padding:0;">';
    const dims = extractDimensions(html);
    assert.strictEqual(dims.width, 1080);
    assert.strictEqual(dims.height, 1080);
  });

  // ── Unit tests for generateOutputFilename (no Puppeteer needed) ──

  console.log('\n📝 generateOutputFilename:');

  await test('generates filename from nested path', () => {
    const result = generateOutputFilename('templates/breaking-news/instagram-post.html');
    assert.strictEqual(result, 'breaking-news_instagram-post.png');
  });

  await test('generates filename from flat path', () => {
    const result = generateOutputFilename('my-design.html');
    assert.strictEqual(result, 'my-design.png');
  });

  await test('generates filename from deep nested path', () => {
    const result = generateOutputFilename('/some/path/market-update/banner.html');
    assert.strictEqual(result, 'market-update_banner.png');
  });

  await test('output filename ends with .png', () => {
    const result = generateOutputFilename('anything/test.html');
    assert.ok(result.endsWith('.png'), `Expected .png extension, got: ${result}`);
  });

  await test('output filename contains only valid filesystem characters', () => {
    const result = generateOutputFilename('templates/stat-of-the-day/linkedin-post.html');
    assert.ok(/^[a-zA-Z0-9._-]+$/.test(result), `Invalid characters in: ${result}`);
  });

  // ── Unit tests for findHtmlFiles (no Puppeteer needed) ──

  console.log('\n📂 findHtmlFiles:');

  await test('finds HTML files in templates directory', () => {
    const templatesDir = path.join(projectRoot, 'templates');
    if (!fs.existsSync(templatesDir)) skip('templates directory not found');
    const files = findHtmlFiles(templatesDir);
    assert.ok(files.length > 0, 'Expected at least one HTML file in templates/');
    assert.ok(files.every(f => f.endsWith('.html')), 'All files should be .html');
  });

  await test('throws for non-existent directory', () => {
    assert.throws(
      () => findHtmlFiles('/non/existent/path/xyz'),
      /not found|ENOENT/i
    );
  });

  // ── Unit tests for cleanOutput ──

  console.log('\n🧹 cleanOutput:');

  await test('cleans files but preserves .gitkeep', () => {
    const tmpCleanDir = path.join(testTmpDir, 'clean-test');
    ensureDir(tmpCleanDir);
    fs.writeFileSync(path.join(tmpCleanDir, '.gitkeep'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpCleanDir, 'test1.png'), 'fake', 'utf-8');
    fs.writeFileSync(path.join(tmpCleanDir, 'test2.png'), 'fake', 'utf-8');

    const { cleaned, preserved } = cleanOutput(tmpCleanDir);
    assert.strictEqual(cleaned, 2);
    assert.ok(preserved.includes('.gitkeep'));
    assert.ok(fs.existsSync(path.join(tmpCleanDir, '.gitkeep')), '.gitkeep should still exist');
    assert.ok(!fs.existsSync(path.join(tmpCleanDir, 'test1.png')), 'test1.png should be deleted');
  });

  await test('reports 0 cleaned for empty directory', () => {
    const tmpEmptyDir = path.join(testTmpDir, 'empty-test');
    ensureDir(tmpEmptyDir);
    const { cleaned } = cleanOutput(tmpEmptyDir);
    assert.strictEqual(cleaned, 0);
  });

  await test('handles non-existent output directory gracefully', () => {
    const { cleaned } = cleanOutput(path.join(testTmpDir, 'does-not-exist'));
    assert.strictEqual(cleaned, 0);
  });

  // ── Puppeteer-dependent integration tests ──

  console.log('\n🖼️  Puppeteer rendering (requires puppeteer):');

  const testOutputDir = path.join(testTmpDir, 'render-output');

  await test('single render produces valid PNG file', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    ensureDir(testOutputDir);
    const htmlFile = createTestHtml(
      path.join(testTmpDir, 'test-content', 'single-test.html'),
      800, 600
    );

    const { outputPath, width, height } = await renderHtmlToPng(htmlFile, testOutputDir);

    assert.ok(fs.existsSync(outputPath), `Output file should exist: ${outputPath}`);
    assert.ok(isValidPng(outputPath), 'Output should be a valid PNG file');
    assert.strictEqual(width, 800);
    assert.strictEqual(height, 600);
  });

  await test('rendered PNG has correct dimensions', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    ensureDir(testOutputDir);
    const htmlFile = createTestHtml(
      path.join(testTmpDir, 'test-content', 'dims-test.html'),
      1080, 1920
    );

    const { outputPath } = await renderHtmlToPng(htmlFile, testOutputDir);
    assert.ok(isValidPng(outputPath), 'Output should be a valid PNG');

    const dims = getPngDimensions(outputPath);
    assert.strictEqual(dims.width, 1080, `Expected width 1080, got ${dims.width}`);
    assert.strictEqual(dims.height, 1920, `Expected height 1920, got ${dims.height}`);
  });

  await test('render fails gracefully for non-existent file', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    try {
      await renderHtmlToPng('/non/existent/file.html', testOutputDir);
      assert.fail('Should have thrown an error');
    } catch (err) {
      assert.ok(err.message.includes('not found'), `Expected "not found" error, got: ${err.message}`);
    }
  });

  await test('batch render processes multiple files', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    const batchDir = path.join(testTmpDir, 'batch-input');
    ensureDir(batchDir);
    createTestHtml(path.join(batchDir, 'file1.html'), 400, 400);
    createTestHtml(path.join(batchDir, 'file2.html'), 600, 300);

    const batchOutputDir = path.join(testTmpDir, 'batch-output');
    ensureDir(batchOutputDir);

    const files = findHtmlFiles(batchDir);
    const result = await renderBatch(files, batchOutputDir);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.succeeded, 2);
    assert.strictEqual(result.failed, 0);
  });

  await test('batch render continues on error and reports failures', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    const batchDir = path.join(testTmpDir, 'batch-error-input');
    ensureDir(batchDir);
    createTestHtml(path.join(batchDir, 'good.html'), 400, 400);

    const batchOutputDir = path.join(testTmpDir, 'batch-error-output');
    ensureDir(batchOutputDir);

    // Mix a valid file with a non-existent one
    const files = [
      path.join(batchDir, 'good.html'),
      path.join(batchDir, 'does-not-exist.html'),
    ];

    const result = await renderBatch(files, batchOutputDir);

    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.succeeded, 1);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.failures.length, 1);
    assert.ok(result.failures[0].file.includes('does-not-exist.html'));
  });

  await test('output filename format from rendered file', async () => {
    if (!puppeteerAvailable) skip('Puppeteer not installed');

    const contentDir = path.join(testTmpDir, 'breaking-news');
    ensureDir(contentDir);
    createTestHtml(path.join(contentDir, 'instagram-post.html'), 1080, 1080);

    const fmtOutputDir = path.join(testTmpDir, 'fmt-output');
    ensureDir(fmtOutputDir);

    const { outputPath } = await renderHtmlToPng(
      path.join(contentDir, 'instagram-post.html'),
      fmtOutputDir
    );

    const filename = path.basename(outputPath);
    assert.strictEqual(filename, 'breaking-news_instagram-post.png');
    assert.ok(/^[a-zA-Z0-9._-]+$/.test(filename), `Invalid characters in filename: ${filename}`);
  });

  // ── Cleanup ──

  cleanDir(testTmpDir);

  // ── Summary ──

  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`   Total:   ${totalTests}`);
  console.log(`   Passed:  ${passedTests}`);
  console.log(`   Skipped: ${skippedTests}`);
  console.log(`   Failed:  ${failedTests}`);

  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    for (const { name, error } of failures) {
      console.log(`   - ${name}: ${error}`);
    }
  }

  console.log('='.repeat(50) + '\n');

  if (!puppeteerAvailable) {
    console.log('ℹ️  Puppeteer is not installed. Puppeteer-dependent tests were skipped.');
    console.log('   Install with: npm install (in xending-design/)\n');
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
