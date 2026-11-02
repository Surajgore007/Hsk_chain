import fs from 'fs';
import path from 'path';

const searchTerms = [
  '87.5', '87.6', '8750', '8,750', '17500', '17,580', '42k', '$42',
  '0x12345678', 'REPLAY', 'fixtures', 'demo-run', 'Math.random',
  '42 WHSK', '120 WHSK', '100 WHSK', 'qwen', 'mock', 'fake',
  'placeholder', 'TODO', 'localStorage'
];

const ignoreDirs = new Set(['node_modules', '.git', 'out', 'cache', 'dist', '.gemini', 'lib']);

const rootDir = process.cwd();

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (ignoreDirs.has(file)) continue;
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath, fileList);
      } else {
        const ext = path.extname(file).toLowerCase();
        if (['.ts', '.tsx', '.js', '.jsx', '.json', '.sol', '.md', '.html', '.css', '.env', '.example'].includes(ext) || file.startsWith('.env')) {
          if (!fullPath.includes('audit-raw.json') && !fullPath.includes('audit-report.json')) {
            fileList.push(fullPath);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  return fileList;
}

const allFiles = walk(rootDir);
const results = {};

for (const term of searchTerms) {
  results[term] = [];
}

for (const filePath of allFiles) {
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const term of searchTerms) {
        if (line.toLowerCase().includes(term.toLowerCase())) {
          results[term].push({
            file: relPath,
            line: idx + 1,
            match: term,
            content: line.trim()
          });
        }
      }
    });
  } catch (err) {
    // ignore
  }
}

fs.writeFileSync('audit-raw.json', JSON.stringify(results, null, 2), 'utf8');

console.log('=== AUDIT SEARCH COMPLETE ===');
for (const [term, matches] of Object.entries(results)) {
  const codeMatches = matches.filter(m => !m.file.startsWith('docs/') && !m.file.startsWith('agent/test/') && !m.file.startsWith('contracts/test/'));
  console.log(`${term.padEnd(15)} : total ${matches.length.toString().padStart(4)} (src/web/scripts: ${codeMatches.length.toString().padStart(3)})`);
}
