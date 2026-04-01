import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Auto-detect project type from marker files.
 * @param {string} targetDir
 * @returns {{ lang: string, framework: string, srcDir: string, testDir: string } | null}
 */
export function detectProject(targetDir) {
  const has = (file) => existsSync(join(targetDir, file));
  const hasGlob = (ext) => {
    try {
      return readdirSync(targetDir).some((f) => f.endsWith(ext));
    } catch {
      return false;
    }
  };
  const packageContains = (str) => {
    try {
      return readFileSync(join(targetDir, 'package.json'), 'utf-8').includes(str);
    } catch {
      return false;
    }
  };
  const gemfileContains = (str) => {
    try {
      return readFileSync(join(targetDir, 'Gemfile'), 'utf-8').includes(str);
    } catch {
      return false;
    }
  };

  // Swift (SPM)
  if (has('Package.swift')) {
    return { lang: 'Swift', framework: 'XCTest (SPM)', srcDir: 'Sources', testDir: 'Tests' };
  }

  // Swift (Xcode)
  if (hasGlob('.xcworkspace') || hasGlob('.xcodeproj')) {
    return { lang: 'Swift', framework: 'XCTest (Xcode)', srcDir: 'Sources', testDir: 'Tests' };
  }

  // Node.js / TypeScript
  if (has('package.json')) {
    let framework = 'npm test';
    if (has('vitest.config.ts') || has('vitest.config.js') || has('vitest.config.mts') || packageContains('"vitest"')) {
      framework = 'Vitest';
    } else if (has('jest.config.ts') || has('jest.config.js') || has('jest.config.mjs') || packageContains('"jest"')) {
      framework = 'Jest';
    }
    const testDir = existsSync(join(targetDir, '__tests__')) ? '__tests__' : 'tests';
    return { lang: 'TypeScript/JavaScript', framework, srcDir: 'src', testDir };
  }

  // Python
  if (has('pyproject.toml') || has('setup.py') || has('pytest.ini')) {
    return { lang: 'Python', framework: 'pytest', srcDir: 'src', testDir: 'tests' };
  }

  // Rust
  if (has('Cargo.toml')) {
    return { lang: 'Rust', framework: 'cargo test', srcDir: 'src', testDir: 'tests' };
  }

  // Go
  if (has('go.mod')) {
    return { lang: 'Go', framework: 'go test', srcDir: '.', testDir: '.' };
  }

  // Java/Kotlin (Gradle)
  if (has('build.gradle') || has('build.gradle.kts')) {
    return { lang: 'Java/Kotlin', framework: 'Gradle', srcDir: 'src/main', testDir: 'src/test' };
  }

  // Java (Maven)
  if (has('pom.xml')) {
    return { lang: 'Java', framework: 'Maven', srcDir: 'src/main', testDir: 'src/test' };
  }

  // C# (.NET)
  if (hasGlob('.sln')) {
    return { lang: 'C#', framework: '.NET (dotnet test)', srcDir: 'src', testDir: 'tests' };
  }

  // Ruby
  if (has('Gemfile')) {
    const framework = gemfileContains('rspec') ? 'RSpec' : 'Minitest';
    const testDir = framework === 'RSpec' ? 'spec' : 'test';
    return { lang: 'Ruby', framework, srcDir: 'lib', testDir };
  }

  return null;
}
