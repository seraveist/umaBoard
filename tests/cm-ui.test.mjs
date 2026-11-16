import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),css=read('assets/cm.css'),app=read('assets/cm-app.mjs');

test('new entry has one skill checklist and five initial input groups, without initial SP/stamina advice',()=>{
 assert.match(html,/id="setup-form" novalidate/);assert.match(html,/id="skill-table-body"/);
 assert.equal((html.match(/<table /g)||[]).length,1);assert.ok(!html.includes('sp-budget'));assert.ok(!html.includes('stat-speed'));
 assert.ok(existsSync(new URL('../legacy.html',import.meta.url)));
 for(const id of ['outfit-picker','course','support-deck','scenario','generate','skill-search','load-more','export-checklist'])assert.ok(html.includes(`id="${id}"`));
});

test('selection dialogs, semantic controls, restore focus and IME-safe searches are wired',()=>{
 assert.match(html,/<dialog id="picker-dialog"[^>]+aria-labelledby="picker-title"/);
 assert.match(html,/<dialog id="owned-dialog"[^>]+aria-labelledby="owned-title"/);
 assert.match(app,/compositionstart/);assert.match(app,/compositionend/);assert.match(app,/returnFocus\?\.focus/);
 assert.match(app,/message.requestId!==requestId/);assert.match(app,/body.children\[index\]!==node/);
 assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(app));
});

test('global scrollbars, reduced motion, keyboard focus, local fonts and 30-row appends are present',()=>{
 assert.match(css,/scrollbar-color:var\(--scroll-thumb\)/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/forced-colors/);
 assert.match(css,/@font-face/);assert.match(app,/limit\+=30/);assert.match(app,/limit=30/);
 assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/for="skill-search"/);
 assert.match(read('DESIGN.md'),/primary: "#126c55"/);assert.match(css,/--primary:#126c55/);
});
