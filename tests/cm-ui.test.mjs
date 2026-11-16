import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const html=read('index.html'),css=read('assets/cm.css'),app=read('assets/cm-app.mjs');

test('new entry has one skill checklist and five initial input groups, without initial SP/stamina advice',()=>{
 assert.match(html,/id="setup-form" novalidate/);assert.match(html,/id="skill-table-body"/);
 assert.equal((html.match(/<table /g)||[]).length,1);
 const initialForm=html.slice(html.indexOf('<form id="setup-form"'),html.indexOf('</form></aside>'));
 assert.ok(!initialForm.includes('actual-sp'));assert.ok(!initialForm.includes('actual-speed'));
 assert.ok(existsSync(new URL('../legacy.html',import.meta.url)));
 for(const id of ['outfit-picker','course','support-deck','scenario','generate','skill-search','export-checklist'])assert.ok(html.includes(`id="${id}"`));
});

test('selection dialogs, semantic controls, restore focus and IME-safe searches are wired',()=>{
 assert.match(html,/<dialog id="picker-dialog"[^>]+aria-labelledby="picker-title"/);
 assert.match(html,/<dialog id="owned-dialog"[^>]+aria-labelledby="owned-title"/);
 assert.match(app,/compositionstart/);assert.match(app,/compositionend/);assert.match(app,/returnFocus\?\.focus/);
 assert.match(app,/message.requestId!==requestId/);assert.match(app,/body.children\[index\]!==node/);
 assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(app));
});

test('global scrollbars, reduced motion, keyboard focus, local fonts and the full scrollable checklist are present',()=>{
 assert.match(css,/scrollbar-color:var\(--scroll-thumb\)/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/forced-colors/);
 assert.match(css,/@font-face/);assert.ok(!app.includes('filtered.slice('));assert.ok(!html.includes('load-more'));
 assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/for="skill-search"/);
 assert.match(read('DESIGN.md'),/primary: "#126c55"/);assert.match(css,/--primary:#126c55/);
});

test('post-training owns a separate validated form, scoped draft, cancellable worker and stale-result handling',()=>{
 const final=read('assets/cm-final-ui.mjs');
 assert.match(html,/<form id="final-form" novalidate/);assert.match(html,/<fieldset id="final-fields" disabled/);
 for(const key of ['speed','stamina','power','guts','wisdom','sp']){assert.ok(html.includes(`for="actual-${key}"`));assert.ok(html.includes(`id="actual-${key}"`));}
 assert.match(final,/aria-invalid/);assert.match(final,/input\.focus/);assert.match(final,/worker\?\.terminate/);assert.match(final,/reply.requestId!==requestId/);
 assert.match(app,/\.postTraining=value/);assert.match(app,/finalPlanner\?\.invalidate/);assert.match(final,/이전 조건의 결과/);
 assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(final));
});
