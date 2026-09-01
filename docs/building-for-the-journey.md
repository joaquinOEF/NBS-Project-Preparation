# Build for the journey, not the component

For whoever works on this next, human or model. Written after a session in which
the same mistake was made four times in a row, each time with passing tests.

## What the app is

One organisation walking through six encontros. Not six workshops, not a chat
plus a board plus a report — **one path, one person, start to end.** Every piece
of this repo exists to move somebody along that path, and a piece that works
perfectly while the path is broken has not worked.

## The mistake, four times in one session

An organisation finished Encontro 2 and could not reach Encontro 3. Each fix was
correct, each was verified, each was reported as done, and the organisation
stayed stuck:

1. **Access.** Its `unlockedPhases` had no 3. Fixed, declared done. It was still
   stuck — the org already had access; that was never its problem.
2. **The entry screen.** It offered the preamble for the encontro they had just
   finished, keyed off `state.phase`, which finishing does not move. Fixed,
   declared done. Still stuck.
3. **The banner.** The only other way forward was suppressed by a composer
   restored from the transcript — answered, "Pronto ✓", and still counted as a
   live question. Fixed. *Then* they got in.
4. **And what they found there:** the Encontro 3 opener run together with the
   Encontro 2 closing line in one bubble, and — the next time they came back —
   the thread opening at the top of Encontro 2 with weeks of scrolling to reach
   the live question.

Four separate defects, one journey, and every single one was found by the person
using it rather than by the person building it.

## Why the tests did not catch it

They tested the component that was being changed, with fixtures that encoded the
same assumption as the code:

- a test seeded a "finished" Encontro 2 as *a pile of site fields*, which is
  what the buggy predicate also believed — so it passed while a barely-started
  organisation was being offered Encontro 3;
- a test seeded the thread with a plain closing message instead of the answered
  composer that really ends Encontro 2 — so it passed against a build where the
  real organisation was still stuck.

**A fixture that encodes your assumption tests your assumption, not the
product.** Seed from a real record when one exists: the coordinator's context
export settled in one read what four rounds of reasoning had not.

## The rules that follow

1. **Walk the whole path before claiming a fix.** Open the link the way they
   open it, click what they would click, and arrive where they are going. Not
   "the endpoint returns 3", not "the component renders" — the journey.
2. **Ask what happens NEXT.** A fix that gets someone through a door is not
   finished until you have looked at the room. Both the merged bubble and the
   scroll position were sitting one step past a door that had just been fixed.
3. **Ask who else is on this path.** The stricter close predicate was correct
   for the stuck organisation and would have thrown every organisation
   mid-Encontro-2 into Encontro 3 — caught only because someone asked "what
   about the orgs currently in W2?".
4. **Verify a landing by reading the code on `main`,** never the PR list. Three
   times in one session, commits were pushed to a branch whose PR had already
   merged and reported as shipped; `git show origin/main:<file> | grep` takes
   seconds and is not fooled.
5. **Prefer a check that fails to a principle that reminds.**
   `docs/full-context-rule.md` said "read the whole record" and the same author
   shipped the same class of bug twice underneath it. `npm run w3:sweep` now
   carries `asks-what-w2-answered`, and it fails.

## The question to ask before writing anything

Not *"does this component do its job?"* but *"can somebody get from where they
were to where they are going, and does the next thing they see make sense?"*
