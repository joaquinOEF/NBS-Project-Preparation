// Prints the indicator menu as the review sheet Robson signs
// (docs/e4-indicators-review.md). Generated, never hand-edited:
// e2e/e4-indicators.spec.ts fails when the committed sheet drifts from the code.
//
//   npx tsx scripts/e4-indicators-review.ts > docs/e4-indicators-review.md
import { reviewSheetMarkdown } from '../shared/e4-indicators-review';

process.stdout.write(reviewSheetMarkdown());
