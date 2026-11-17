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
 assert.match(app,/\.postTraining=value/);assert.match(app,/finalPlanner\?\.invalidate/);assert.match(final,/재추천 필요/);
 assert.ok(!/\b(?:alert|confirm|prompt)\s*\(/.test(final));
});

test('compact inputs expose the discount trait, collapsed aptitude settings, whole-list actions and shared name badges',()=>{
 assert.match(html,/<select id="discount-trait">/);assert.match(html,/<option value="none">없음<\/option><option value="studious">공부가<\/option><option value="fast-learner">수완가<\/option>/);assert.match(html,/<details class="aptitude-options">/);
 for(const id of ['bulk-unavailable','bulk-level5'])assert.ok(html.includes(`id="${id}"`));
 assert.match(app,/bulkAcquisition\(/);assert.match(app,/states\[row.id\]==='owned'/);assert.match(app,/skillNameLine\(row\)/);assert.match(app,/skillSources\(row\)/);
 assert.ok(!app.includes("'skill-kind'"));assert.match(css,/\.skill-badge/);assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);
});

test('the workflow has two accessible stage panels and one shared checklist with no duplicate input IDs',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
 for(const stage of ['prepare','finish']){assert.match(html,new RegExp(`id="stage-${stage}"[^>]*role="tab"`));assert.match(html,new RegExp(`id="${stage}-stage"[^>]*role="tabpanel"`));}
 assert.match(html,/id="stage-finish"[^>]*disabled/);assert.match(html,/id="finish-stage"[^>]*hidden/);
 assert.equal((html.match(/id="checklist"/g)||[]).length,1);assert.match(html,/id="prepare-checklist-slot"/);assert.match(html,/id="finish-checklist-slot"/);
 assert.match(html,/<details id="final-inputs"[^>]*open/);assert.match(html,/id="final-submit"[^>]*form="final-form"/);
 for(const view of ['record','result'])assert.match(html,new RegExp(`id="post-view-${view}"[^>]*role="tab"`));
 assert.match(app,/workflow\.setChartState\('ready'\)/);assert.match(app,/workflow\.setChartState\('loading'\)/);
 for(const match of html.matchAll(/<label[^>]*\bfor="([^"]+)"/g))assert.ok(ids.includes(match[1]),match[1]);
});
