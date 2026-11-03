// Marks the copy on internal pages so the in-page editor (components/SiteCopy) can edit it:
// every plain run of text inside JSX becomes <T k="...">text</T>. Data (names, numbers,
// anything from an expression) is untouched. Keys come from the file and the text itself,
// so a line keeps its saved edit until a developer changes the default wording.
//   node scripts/mark-copy.cjs <files...>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const SKIP_TAGS = new Set(['T', 'CopyImage', 'option', 'title', 'meta', 'textarea', 'style', 'script', 'code', 'pre', 'svg', 'Text', 'Link.Text']);
const hasLetters = (s) => /[A-Za-z]{2,}/.test(s);

function tagName(node) {
  const n = node?.openingElement?.name;
  if (!n) return '';
  if (n.type === 'JSXIdentifier') return n.name;
  if (n.type === 'JSXMemberExpression') return `${n.object.name}.${n.property.name}`;
  return '';
}

function mark(file) {
  const src = fs.readFileSync(file, 'utf8');
  if (/@react-pdf/.test(src)) return 0;
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const slug = path.relative('src', file).replace(/\.jsx?$/, '').replace(/[\\/]/g, '.').replace(/[^A-Za-z0-9.]/g, '').toLowerCase();
  const edits = [];
  traverse(ast, {
    JSXText(p) {
      const raw = p.node.value;
      const text = raw.replace(/\s+/g, ' ').trim();
      if (!hasLetters(text)) return;
      // Inside something that can't hold a <T>, or already marked: leave it.
      for (let a = p.parentPath; a; a = a.parentPath) {
        if (a.node.type === 'JSXElement') {
          const t = tagName(a.node);
          if (SKIP_TAGS.has(t)) return;
          if (a.node.openingElement.attributes.some(x => x.type === 'JSXAttribute' && x.name.name === 'dangerouslySetInnerHTML')) return;
        }
      }
      // Plain whitespace only: a non-breaking space is part of the text and stays inside.
      const lead = raw.match(/^[ \t\r\n]*/)[0], trail = raw.match(/[ \t\r\n]*$/)[0];
      const inner = raw.slice(lead.length, raw.length - trail.length);
      // Line breaks inside the text would be one space anyway; keep the words as written.
      const key = `${slug}.${crypto.createHash('md5').update(text).digest('hex').slice(0, 6)}`;
      edits.push({ start: p.node.start, end: p.node.end, text: `${lead}<T k="${key}">${inner.replace(/[ \t]*\n[ \t]*/g, ' ')}</T>${trail}` });
    },
  });
  if (!edits.length) return 0;
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!/import\s*\{[^}]*\bT\b[^}]*\}\s*from\s*['"][^'"]*components\/SiteCopy['"]/.test(out)) {
    const rel = path.relative(path.dirname(file), path.join('src', 'components', 'SiteCopy')).replace(/\\/g, '/');
    const imp = `import { T } from '${rel.startsWith('.') ? rel : './' + rel}';\n`;
    // Before the first import (after any leading comments), which is always a safe spot.
    const first = ast.program.body.find(n => n.type === 'ImportDeclaration');
    out = first ? out.slice(0, first.start) + imp + out.slice(first.start) : imp + out;
  }
  fs.writeFileSync(file, out);
  return edits.length;
}

let total = 0;
for (const f of process.argv.slice(2)) { const n = mark(f); if (n) console.log(`${n}\t${f}`); total += n; }
console.log(`marked ${total} lines`);
