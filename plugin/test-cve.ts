import { filterPackageMetadata } from './src/metadata-filter';
import type { PackageMetadata, CVEVulnerabilityRule } from './src/types';

// Test CVE filtering
const testMetadata: PackageMetadata = {
  name: 'lodash',
  versions: {
    '4.17.4': { name: 'lodash', version: '4.17.4' },
    '4.17.20': { name: 'lodash', version: '4.17.20' },
    '4.17.21': { name: 'lodash', version: '4.17.21' },
  },
  'dist-tags': { latest: '4.17.21' },
  time: {
    '4.17.4': '2018-01-01T00:00:00.000Z',
    '4.17.20': '2018-12-01T00:00:00.000Z',
    '4.17.21': '2019-01-01T00:00:00.000Z',
  }
};

const cveRules: CVEVulnerabilityRule[] = [
  {
    package: 'lodash',
    type: 'cve',
    vulnerableRange: '<4.17.21',
    cveId: 'CVE-2018-3721',
    severity: 'high'
  }
];

const filtered = filterPackageMetadata(testMetadata, {
  denylistRules: [],
  allowlistRules: [],
  cveVulnerabilities: cveRules
});

console.log('CVE Filter Test:');
console.log(`Original versions: ${Object.keys(testMetadata.versions)}`);
console.log(`Filtered versions: ${Object.keys(filtered.versions)}`);
console.log(`Removed vulnerable versions: ${Object.keys(testMetadata.versions).length - Object.keys(filtered.versions).length}`);

if (Object.keys(filtered.versions).length === 1 && filtered.versions['4.17.21']) {
  console.log('✓ CVE filtering works correctly!');
} else {
  console.log('✗ CVE filtering failed');
  process.exit(1);
}
