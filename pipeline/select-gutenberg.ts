/**
 * Choose English-language literature from GITenberg metadata, skipping works
 * already imported from Standard Ebooks.
 * usage: select-gutenberg.ts <meta-dir> <standard-ebooks-repos.txt> <out.txt>   (lines: "<repo> <gutenberg-id>")
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , metaDir, seList, out] = process.argv;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const se = new Set<string>();
for (const line of readFileSync(seList, 'utf8').split('\n')) {
  const parts = line.trim().split('_');
  if (parts.length >= 2) se.add(`${parts[0].split('-').pop()}|${norm(parts[1].replace(/-/g, ' '))}`);
}
const sel: string[] = [];
for (const f of readdirSync(metaDir).filter((x) => x.endsWith('.yaml')).sort()) {
  const t = readFileSync(join(metaDir, f), 'utf8');
  if (!/^language: en\s*$/m.test(t)) continue;
  if (!/Fiction|lcc: P[RSZQT]|lcsh: .*(Drama|Poetry|Short stories)/.test(t)) continue;
  if (/Periodicals|Dictionaries|Encyclopedias|Bibliography|Indexes/.test(t)) continue;
  const id = /^\s+gutenberg: .(\d+)./m.exec(t)?.[1];
  const title = /^title: (.+)$/m.exec(t)?.[1];
  const agent = /agent_name: ([^\n]+)/.exec(t)?.[1];
  if (!id || !title) continue;
  const surname = agent ? norm(agent.split(',')[0]).split(' ').pop() : '';
  if (se.has(`${surname}|${norm(title.replace(/^['"]|['"]$/g, ''))}`)) continue;
  sel.push(`${f.slice(0, -5)} ${id}`);
}
writeFileSync(out, sel.join('\n') + '\n');
console.log(`${sel.length} works selected → ${out}`);
