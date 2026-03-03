function isPathMatch(pattern: string, path: string): boolean {
  if (!pattern || !path) return false;
  if (pattern === path) return true;

  const patternSegments = pattern.split('/').filter(Boolean);
  const pathSegments = path.split('/').filter(Boolean);

  if (patternSegments.length !== pathSegments.length) return false;

  return patternSegments.every((seg, i) => {
    // Support :param and [param]
    if (seg.startsWith(':') || (seg.startsWith('[') && seg.endsWith(']')))
      return true;
    return seg === pathSegments[i];
  });
}

const testCases = [
  { pattern: '/home', path: '/home', expected: true },
  { pattern: '/home', path: '/dashboard', expected: false },
  { pattern: '/users/:id', path: '/users/123', expected: true },
  { pattern: '/users/:id/profile', path: '/users/123/profile', expected: true },
  { pattern: '/videos/[id]', path: '/videos/456', expected: true },
  {
    pattern: '/videos/[id]/detail',
    path: '/videos/789/detail',
    expected: true,
  },
  { pattern: '/videos/[id]', path: '/videos/456/edit', expected: false },
  {
    pattern: '/complex/[category]/:id',
    path: '/complex/tech/999',
    expected: true,
  },
];

let failed = 0;
testCases.forEach((tc, index) => {
  const result = isPathMatch(tc.pattern, tc.path);
  if (result === tc.expected) {
    console.log(`Test Case ${index} PASSED`);
  } else {
    console.error(
      `Test Case ${index} FAILED: Pattern '${tc.pattern}' Path '${tc.path}' Expected ${tc.expected} Got ${result}`,
    );
    failed++;
  }
});

if (failed === 0) {
  console.log('All tests passed!');
} else {
  console.log(`${failed} tests failed.`);
}
