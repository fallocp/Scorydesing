#!/usr/bin/env node

/**
 * render-batch.js — Batch HTML → PNG renderer using Puppeteer
 *
 * Usage:
 *   node scripts/render-batch.js <directory>
 *   node scripts/render-batch.js <file1.html> <file2.html> ...
 *
 * If a directory is provided, finds all .html files recursively.
 * Renders each file sequentially, continuing on error.
 * Reports a summary at the end.
 */

const fs = require('fs');
const path = require('path');
const { renderHtmlToPng } = require('./render');

/**
 * Recursively find all .html files in a directory.
 * @param {string} dirPath - Directory to search
 * @returns {string[]} Array of absolute paths to .html files
 */
function findHtmlFiles(dirPath) {
  const results = [];
  const absoluteDir = path.resolve(dirPath);

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Directory not found: ${absoluteDir}`);
  }

  const stat = fs.statSync(absoluteDir);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${absoluteDir}`);
  }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.html')) {
        results.push(fullPath);
      }
    }
  }

  walk(absoluteDir);
  return results.sort();
}

/**
 * Batch render HTML files to PNG.
 * @param {string[]} htmlFiles - Array of HTML file paths
 * @param {string} [outputDir] - Output directory
 * @returns {Promise<{ total: number, succeeded: number, failed: number, failures: Array<{ file: string, error: string }> }>}
 */
async function renderBatch(htmlFiles, outputDir) {
  const total = htmlFiles.length;
  let succeeded = 0;
  const failures = [];

  for (let i = 0; i < htmlFiles.length; i++) {
    const file = htmlFiles[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      console.log(`${progress} Rendering: ${file}`);
      const { outputPath, width, height } = await renderHtmlToPng(file, outputDir);
      console.log(`  ✅ → ${outputPath} (${width}×${height})`);
      succeeded++;
    } catch (err) {
      console.error(`  ❌ Failed: ${err.message}`);
      failures.push({ file, error: err.message });
    }
  }

  return { total, succeeded, failed: failures.length, failures };
}

// --- CLI entry point ---
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  node scripts/render-batch.js <directory>');
    console.error('  node scripts/render-batch.js <file1.html> <file2.html> ...');
    process.exit(1);
  }

  let htmlFiles = [];

  // Check if the first argument is a directory
  if (args.length === 1 && fs.existsSync(args[0]) && fs.statSync(args[0]).isDirectory()) {
    console.log(`📂 Scanning directory: ${args[0]}`);
    htmlFiles = findHtmlFiles(args[0]);
    console.log(`   Found ${htmlFiles.length} HTML file(s)\n`);
  } else {
    // Treat all arguments as individual HTML file paths
    htmlFiles = args.map(f => path.resolve(f));
  }

  if (htmlFiles.length === 0) {
    console.log('No HTML files found. Nothing to render.');
    process.exit(0);
  }

  const { total, succeeded, failed, failures } = await renderBatch(htmlFiles);

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Batch Render Summary');
  console.log('='.repeat(50));
  console.log(`   Total:     ${total}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed:    ${failed}`);

  if (failures.length > 0) {
    console.log('\n❌ Failed files:');
    for (const { file, error } of failures) {
      console.log(`   - ${file}`);
      console.log(`     Error: ${error}`);
    }
  }

  console.log('='.repeat(50));

  // Exit with error code if any failures
  if (failed > 0) {
    process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export for reuse and tests
module.exports = { renderBatch, findHtmlFiles };
