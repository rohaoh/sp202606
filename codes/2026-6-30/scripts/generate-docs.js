/**
 * API 문서 자동 생성
 * JSDoc 주석을 파싱하여 마크다운 문서 생성
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const docsDir = path.join(root, 'docs');

// 문서 디렉토리 생성
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

/**
 * JSDoc 파싱
 * @param {string} content - 파일 내용
 * @returns {Array} 함수 문서 배열
 */
function parseJSDoc(content) {
  const functions = [];
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // JSDoc 시작 찾기
    if (line.trim().startsWith('/**')) {
      let doc = '';
      let j = i + 1;

      // JSDoc 끝까지 수집
      while (j < lines.length && !lines[j].trim().startsWith('*/')) {
        doc += lines[j].trim().replace(/^\*\s?/, '') + '\n';
        j++;
      }

      // 다음 함수 정의 찾기
      let k = j + 1;
      while (k < lines.length && lines[k].trim() === '') {
        k++;
      }

      const funcLine = lines[k];
      if (funcLine && (funcLine.includes('function ') || funcLine.includes('async '))) {
        const funcMatch = funcLine.match(/(async\s+)?function\s+(\w+)\s*\((.*?)\)/);
        const arrowMatch = funcLine.match(/const\s+(\w+)\s*=\s*\((.*?)\)\s*=>/);

        if (funcMatch || arrowMatch) {
          const name = funcMatch ? funcMatch[2] : arrowMatch[1];
          const params = funcMatch ? funcMatch[3] : arrowMatch[2];
          const isAsync = funcMatch ? !!funcMatch[1] : false;

          functions.push({
            name,
            params,
            isAsync,
            doc: doc.trim(),
            line: k + 1
          });

          i = k;
        }
      }
    }
    i++;
  }

  return functions;
}

/**
 * 마크다운 문서 생성
 * @param {string} filePath - 소스 파일 경로
 * @param {Array} functions - 함수 배열
 * @returns {string} 마크다운 콘텐츠
 */
function generateMarkdown(filePath, functions) {
  const fileName = path.basename(filePath);
  let md = `# ${fileName} API Reference\n\n`;

  if (functions.length === 0) {
    md += 'No documented functions found.\n';
    return md;
  }

  md += `## Functions\n\n`;

  functions.forEach((func, idx) => {
    md += `### ${idx + 1}. \`${func.name}(${func.params})\`\n\n`;

    if (func.isAsync) {
      md += `**Async Function**\n\n`;
    }

    if (func.doc) {
      md += `${func.doc}\n\n`;
    }

    md += `**Location:** Line ${func.line}\n\n`;
  });

  return md;
}

/**
 * 모든 JS 파일에서 API 문서 생성
 */
function generateAllDocs() {
  console.log('📚 API 문서 생성 중...\n');

  const sourceFiles = [
    path.join(root, 'main.js'),
    path.join(root, 'renderer.js'),
    path.join(root, 'error-handler.js'),
  ];

  const allDocs = [];

  sourceFiles.forEach(file => {
    if (!fs.existsSync(file)) return;

    const content = fs.readFileSync(file, 'utf-8');
    const functions = parseJSDoc(content);

    if (functions.length > 0) {
      const md = generateMarkdown(file, functions);
      const docFile = path.join(docsDir, `${path.basename(file, '.js')}.md`);

      fs.writeFileSync(docFile, md);
      console.log(`  ✓ ${path.basename(file)} → ${path.basename(docFile)}`);

      allDocs.push({
        file: path.basename(file),
        functions: functions.map(f => f.name)
      });
    }
  });

  // 메인 API 인덱스 생성
  let indexMd = `# API Reference\n\n`;
  indexMd += `자동 생성된 API 문서입니다.\n\n`;

  allDocs.forEach(doc => {
    indexMd += `## ${doc.file}\n`;
    doc.functions.forEach(func => {
      indexMd += `- [\`${func}()\`](./${doc.file.replace('.js', '.md')}#${func.toLowerCase()})\n`;
    });
    indexMd += '\n';
  });

  fs.writeFileSync(path.join(docsDir, 'README.md'), indexMd);
  console.log(`\n  ✓ API 인덱스 → docs/README.md`);

  // 스키마 문서 생성
  const schemaMd = `# Data Schemas\n\n`;
  fs.writeFileSync(path.join(docsDir, 'SCHEMAS.md'), schemaMd);

  console.log(`\n✅ API 문서 생성 완료 (${allDocs.length} 파일)\n`);
}

// CLI 실행
if (require.main === module) {
  generateAllDocs();
}

module.exports = { parseJSDoc, generateMarkdown, generateAllDocs };
