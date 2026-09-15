const { execSync } = require('child_process');

try {
  const diff = execSync('git diff origin/main..HEAD', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const patterns = [
    /sk_live_[0-9a-zA-Z]{24}/i,
    /bot\d{8,12}:[A-Za-z0-9_-]{35}/,
    /AIzaSy[0-9A-Za-z-_]{33}/,
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[0-9A-Za-z_-]{20,}/,
    /ghp_[0-9a-zA-Z]{36}/
  ];

  let found = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      for (const pat of patterns) {
        if (pat.test(line)) {
          console.warn('Potential secret detected:', line);
          found++;
        }
      }
    }
  }

  if (found === 0) {
    console.log('Secret Scan PASS: No hardcoded API keys, tokens, or private secrets detected in diff.');
  } else {
    console.error(`Secret Scan FAIL: Found ${found} suspicious strings.`);
    process.exit(1);
  }
} catch (err) {
  console.error('Scan error:', err);
  process.exit(1);
}
