const fs = require('fs');
const path = require('path');

const forbidden = [
  '87.5', '87.6', '8750', '8,750', '17500', '17,580', '42k', '$42',
  '0x12345678', '0x3e19273a', 'qwen3.8'
];

const ignoredDirs = ['node_modules', '.git', 'out', 'cache', 'dist'];

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (ignoredDirs.includes(f)) continue;
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      searchDir(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.json') || f.endsWith('.sol') || f.endsWith('.md')) {
      // Don't flag this audit script itself or raw audit logs
      if (f.includes('audit-scan') || f.includes('audit-raw')) continue;
      const content = fs.readFileSync(full, 'utf-8');
      for (const pattern of forbidden) {
        if (content.includes(pattern)) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.includes(pattern)) {
              console.log(`${full}:${idx + 1} contains '${pattern}' -> ${line.trim()}`);
            }
          });
        }
      }
    }
  }
}

searchDir('.');

