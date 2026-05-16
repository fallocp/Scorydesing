#!/usr/bin/env node

/**
 * clean-output.js — Clean the output directory
 *
 * Deletes all files in xending-design/output/ except .gitkeep.
 * Logs how many files were cleaned.
 */

const fs = require('fs');
const path = require('path');

/**
 * Clean the output directory, preserving .gitkeep.
 * @param {string} [outputDir] - Output directory path (defaults to xending-design/output/)
 * @returns {{ cleaned: number, preserved: string[] }}
 */
function cleanOutput(outputDir) {
  const projectRoot = path.resolve(__dirname, '..');
  const outDir = outputDir || path.join(projectRoot, 'output');

  if (!fs.existsSync(outDir)) {
    console.log('Output directory does not exist. Nothing to clean.');
    return { cleaned: 0, preserved: [] };
  }

  const entries = fs.readdirSync(outDir);
  let cleaned = 0;
  const preserved = [];

  for (const entry of entries) {
    const fullPath = path.join(outDir, entry);
    const stat = fs.statSync(fullPath);

    // Preserve .gitkeep
    if (entry === '.gitkeep') {
      preserved.push(entry);
      continue;
    }

    if (stat.isFile()) {
      fs.unlinkSync(fullPath);
      cleaned++;
    } else if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
      cleaned++;
    }
  }

  return { cleaned, preserved };
}

// --- CLI entry point ---
function main() {
  const { cleaned, preserved } = cleanOutput();

  if (cleaned === 0) {
    console.log('🧹 Output directory is already clean.');
  } else {
    console.log(`🧹 Cleaned ${cleaned} file(s) from output directory.`);
  }

  if (preserved.length > 0) {
    console.log(`   Preserved: ${preserved.join(', ')}`);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main();
}

// Export for tests
module.exports = { cleanOutput };
