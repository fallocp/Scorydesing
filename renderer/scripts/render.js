#!/usr/bin/env node

/**
 * render.js — Single HTML → PNG renderer using Puppeteer
 *
 * Usage: node scripts/render.js <html-file-path>
 *
 * Reads the HTML file, extracts width/height from the <html> inline style,
 * launches Puppeteer, sets viewport to template dimensions, navigates to the
 * file via file:// protocol, takes a screenshot, and saves the PNG to output/.
 */

const fs = require('fs');
const path = require('path');

/**
 * Extract width and height from the <html> tag's inline style attribute.
 * Falls back to 1080x1080 if not found.
 * @param {string} html - The HTML content
 * @returns {{ width: number, height: number }}
 */
function extractDimensions(html) {
  const defaultWidth = 1080;
  const defaultHeight = 1080;

  // Match the <html ...style="...width:XXXpx...height:YYYpx..." ...>
  const htmlTagMatch = html.match(/<html[^>]*style\s*=\s*["']([^"']*)["'][^>]*>/i);
  if (!htmlTagMatch) {
    return { width: defaultWidth, height: defaultHeight };
  }

  const styleStr = htmlTagMatch[1];
  const widthMatch = styleStr.match(/width\s*:\s*(\d+)\s*px/i);
  const heightMatch = styleStr.match(/height\s*:\s*(\d+)\s*px/i);

  return {
    width: widthMatch ? parseInt(widthMatch[1], 10) : defaultWidth,
    height: heightMatch ? parseInt(heightMatch[1], 10) : defaultHeight,
  };
}

/**
 * Generate a descriptive output filename from the input HTML file path.
 * e.g., "templates/breaking-news/instagram-post.html" → "breaking-news_instagram-post.png"
 * @param {string} htmlFilePath - Path to the HTML file
 * @returns {string}
 */
function generateOutputFilename(htmlFilePath) {
  const parsed = path.parse(htmlFilePath);
  const parentDir = path.basename(path.dirname(htmlFilePath));
  const baseName = parsed.name;

  // If the parent directory is meaningful (not "." or "scripts"), include it
  if (parentDir && parentDir !== '.' && parentDir !== 'scripts') {
    return `${parentDir}_${baseName}.png`;
  }
  return `${baseName}.png`;
}

/**
 * Render a single HTML file to PNG.
 * @param {string} htmlFilePath - Absolute or relative path to the HTML file
 * @param {string} [outputDir] - Output directory (defaults to xending-design/output/)
 * @returns {Promise<{ outputPath: string, width: number, height: number }>}
 */
async function renderHtmlToPng(htmlFilePath, outputDir) {
  const puppeteer = require('puppeteer');

  const absoluteHtmlPath = path.resolve(htmlFilePath);

  if (!fs.existsSync(absoluteHtmlPath)) {
    throw new Error(`HTML file not found: ${absoluteHtmlPath}`);
  }

  const html = fs.readFileSync(absoluteHtmlPath, 'utf-8');
  const { width, height } = extractDimensions(html);

  // Determine output directory
  const projectRoot = path.resolve(__dirname, '..');
  const outDir = outputDir || path.join(projectRoot, 'output');

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputFilename = generateOutputFilename(htmlFilePath);
  const outputPath = path.join(outDir, outputFilename);

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height });

    // Navigate to the HTML file using file:// protocol
    const fileUrl = `file://${absoluteHtmlPath.replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

    // Screenshot the full page
    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });

    return { outputPath, width, height };
  } finally {
    await browser.close();
  }
}

// --- CLI entry point ---
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node scripts/render.js <html-file-path>');
    process.exit(1);
  }

  const htmlFilePath = args[0];

  try {
    const { outputPath, width, height } = await renderHtmlToPng(htmlFilePath);
    console.log(`✅ Rendered successfully: ${outputPath} (${width}×${height})`);
  } catch (err) {
    console.error(`❌ Render failed: ${err.message}`);
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export for reuse in render-batch.js and tests
module.exports = { renderHtmlToPng, extractDimensions, generateOutputFilename };
