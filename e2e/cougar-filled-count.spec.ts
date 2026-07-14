import { test, expect, type Page } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// The CBO's own "X/7 seções preenchidas" over-counted. It counted a section if
// it had ANY field key — so an invite-prefilled org_profile (source:'invite',
// the org name the ORCHESTRATOR typed at invite) read as 1/7 at turn 0, while
// the coordinator roster derived 0/7 with the stricter server predicate. Now
// both use the shared cboSectionsFilledCount (filled AND non-invite).

/** Open a fresh CBO session and return its auto-created id. */
async function freshCbo(page: Page): Promise<string> {
  await page.goto('/cbo-profile');
  const marker = page.getByTestId('cbo-stream-status');
  await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
  return (await marker.getAttribute('data-cbo-id'))!;
}

test.describe('COUGAR — CBO progress count matches the server predicate', () => {
  test('invite-prefilled fields do not inflate the seções count', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cboId = await freshCbo(page);
    // The invite fills org_name + bairro (source:'invite'), plus an empty-valued
    // user field to prove empties don't count either. No real work yet → 0/7.
    await api.seedState(cboId, {
      phase: 1,
      language: 'pt',
      sections: [
        { sectionId: 'org_profile', field: 'org_name', value: 'Comunidade X', source: 'invite' },
        { sectionId: 'org_profile', field: 'bairro_of_operation', value: 'Centro', source: 'invite' },
        { sectionId: 'org_profile', field: 'mission', value: '', source: 'user' },
      ],
    });
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });

    // Chat-first desktop: the count lives in the collapsed panel — open it.
    await page.getByTestId('cbo-strip-document').click();
    await expect(page.getByText('0/7').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1/7')).toHaveCount(0);
  });

  test('a real org-provided field counts', async ({ page, request }) => {
    const api = new TestApi(request);
    test.skip(!(await api.ping()).fakeModel, 'needs the fake model');

    const cboId = await freshCbo(page);
    await api.seedState(cboId, {
      phase: 1,
      language: 'pt',
      sections: [
        { sectionId: 'org_profile', field: 'org_name', value: 'Comunidade X', source: 'invite' },
        // The org actually answered → the section now counts.
        { sectionId: 'org_profile', field: 'mission', value: 'Reflorestar encostas', source: 'user' },
      ],
    });
    await page.reload();
    await expect(page.getByTestId('cbo-stream-status')).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });

    // Chat-first desktop: the count lives in the collapsed panel — open it.
    await page.getByTestId('cbo-strip-document').click();
    await expect(page.getByText('1/7').first()).toBeVisible({ timeout: 15_000 });
  });
});
