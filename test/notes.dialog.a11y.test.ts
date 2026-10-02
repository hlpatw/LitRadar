import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Static (source-level) accessibility + wiring regression. No browser needed; runs in the
// unit-test gate. Locks in:
//   * Notes dialog opens via a real Radix <DialogTrigger> (New button) and the edit card is
//     a keyboard-operable, focusable element, so Radix returns focus to the invoking control
//     on close and ESC-to-close keeps working.
//   * The shared dialog primitive keeps the EXPLICIT open/closed opacity + responsive sizing
//     (these were the previous visibility fix — must not regress to invisible animate-in).
//   * PaperDetail inline note fires the privacy-safe note event only after a successful create.

const notes = readFileSync(
  join(import.meta.dirname, '..', 'client', 'src', 'pages', 'Notes', 'Notes.tsx'),
  'utf8',
);
const dialog = readFileSync(
  join(import.meta.dirname, '..', 'client', 'src', 'components', 'ui', 'dialog.tsx'),
  'utf8',
);
const paperDetail = readFileSync(
  join(import.meta.dirname, '..', 'client', 'src', 'pages', 'Papers', 'PaperDetail.tsx'),
  'utf8',
);

test('Notes dialog uses a real Radix DialogTrigger for the New button', () => {
  assert.match(notes, /import\s*\{[^}]*\bDialogTrigger\b[^}]*\}\s*from\s*'@\/components\/ui\/dialog'/,
    'Notes must import DialogTrigger');
  assert.match(notes, /<DialogTrigger\s+asChild>/, 'New button must be wrapped in <DialogTrigger asChild>');
});

test('Notes dialog Root is controlled and NoteForm renders only DialogContent (no nested root)', () => {
  // Single controlled root in the page component.
  assert.match(notes, /<Dialog\s+open=\{formOpen\}/, 'Notes must own a single controlled Dialog Root');
  // The old per-form root pattern must be gone (NoteForm used to render its own <Dialog open={open}>).
  assert.doesNotMatch(notes, /<Dialog\s+open=\{open\}/, 'NoteForm must not render its own Dialog Root');
});

test('Notes edit card is a focusable, keyboard-operable trigger', () => {
  assert.match(notes, /role="button"/, 'edit card must expose role=button');
  assert.match(notes, /tabIndex=\{0\}/, 'edit card must be tab-focusable (tabIndex=0)');
  assert.match(notes, /onKeyDown=\{\(e:\s*KeyboardEvent<HTMLDivElement>\) => \{[\s\S]*?e\.key === 'Enter'[\s\S]*?e\.key === ' '[\s\S]*?openEditorFor\(note\)/,
    'edit card must open on Enter/Space');
});

test('Notes dialog exposes accessible name + description (Radix a11y contract)', () => {
  assert.match(notes, /<DialogTitle>/, 'dialog must have a DialogTitle');
  assert.match(notes, /<DialogDescription>/, 'dialog must have a DialogDescription');
});

test('Shared dialog primitive preserves explicit open/closed opacity (visibility fix)', () => {
  assert.match(dialog, /data-\[state=open\]:opacity-100/, 'overlay/content must fade in explicitly');
  assert.match(dialog, /data-\[state=closed\]:opacity-0/, 'overlay/content must fade out explicitly');
  assert.match(dialog, /data-\[state=open\]:scale-100/, 'content must scale-in explicitly');
  assert.match(dialog, /data-\[state=closed\]:scale-95/, 'content must scale-out explicitly');
});

test('Shared dialog primitive preserves responsive sizing', () => {
  assert.match(dialog, /max-h-\[85dvh\]/, 'dialog must cap at 85dvh for small/zoomed viewports');
  assert.match(dialog, /w-\[calc\(100vw-2rem\)\]/, 'dialog must be full-bleed with margin on mobile');
  assert.match(notes, /sm:max-w-lg/, 'Notes dialog must keep the sm:max-w-lg responsive width');
});

test('PaperDetail inline note emits the privacy-safe note event only after a successful create', () => {
  assert.match(paperDetail, /import\s*\{\s*trackNote\s*\}\s*from\s*'@\/utils\/events'/,
    'PaperDetail must import trackNote');
  // trackNote must be invoked AFTER the awaited createNote, inside the try block (success path).
  const createIdx = paperDetail.indexOf('await workspace.createNote(');
  const trackIdx = paperDetail.indexOf('trackNote(paper.id)');
  assert.ok(createIdx > -1, 'saveNote must call workspace.createNote');
  assert.ok(trackIdx > createIdx, 'trackNote must fire only AFTER a successful createNote');
  // The event call must not carry content/tags — trackNote takes only the paperId.
  assert.match(paperDetail, /trackNote\(paper\.id\)/, 'trackNote must carry paperId only');
});
