import { test, expect } from '@playwright/test';
import { TestApi } from './helpers/testApi';

// W2 (Aug 2026). Two orgs answered nbs_experience = "Ainda não". Desabafa got
// the right follow-up; Periferia Feminista got the yes-presuming one — the
// exact wording the skill tells the model not to use on that branch. Same
// input, different output, and hers cost a real answer: she used the turn to
// correct the previous question instead.
//
// And Misturaí was served the same five questions twice, three seconds apart,
// and answered every one of them twice — the existing re-ask guard only catches
// fields that are already ANSWERED.
//
// The manifest owns the wording of the questions that broke — handed over at
// the CLOSE GATE, which is where the broken one actually lives:
// nbs_experience_detail is asked as prose and never reaches ask_user.
//
// ask_user itself deliberately does NOT rewrite questions. Chip labels cannot
// identify a field reliably enough for that, and an earlier attempt silently
// rewrote questions nobody had complained about.
test.describe('COUGAR — E1 question wording comes from the manifest', () => {
  const bootstrap = async (page: any) => {
    await page.goto('/cbo-profile');
    const marker = page.getByTestId('cbo-stream-status');
    await expect(marker).toHaveAttribute('data-cbo-id', /.+/, { timeout: 30_000 });
    await expect(marker).toHaveAttribute('data-streaming', 'false', { timeout: 30_000 });
    return { cboId: (await marker.getAttribute('data-cbo-id'))!, marker };
  };

  test('ask_user never rewrites the question — the model owns chat wording', async ({ request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');
    const cohort = (await api.createCohort('Unlisted cohort')).cohort;
    const { member } = await api.inviteMember(cohort.id, { orgName: 'Unlisted Org', withSession: true });

    const res = await request.post(`/__test/cbo/${member.cboStateId}/ask-guards`, {
      data: {
        lang: 'pt',
        questions: [{
          question: 'Como é a estrutura da equipe?',
          options: [{ label: 'Todas voluntárias' }, { label: 'Maioria pagas' }],
        }],
      },
    });
    const body = await res.json();
    // Chip labels cannot identify a field reliably ("Sim"/"Ainda não" belong to
    // has_cnpj AND nbs_experience), so this tool must never rewrite a question.
    // The manifest's wording is handed over at the close gate instead.
    expect(body.items[0].question, 'the question reaches the org exactly as asked')
      .toBe('Como é a estrutura da equipe?');
  });

  // The bug this whole change exists for. nbs_experience_detail is asked as
  // PROSE, so it never passes through ask_user — the close gate is where its
  // wording is handed over. Desabafa got the right sentence, Periferia
  // Feminista got the yes-presuming one, from the same stored answer.
  test('the follow-up wording is chosen by the stored answer, not recalled', async ({ request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');

    const mk = async (answer: string) => {
      const cohort = (await api.createCohort(`Branch ${answer}`)).cohort;
      const { member } = await api.inviteMember(cohort.id, { orgName: `Branch ${answer}`, withSession: true });
      const cboId = member.cboStateId as string;
      await request.post(`/api/cbo/${cboId}/edit`, {
        data: { sectionId: 'org_profile', field: 'nbs_experience', value: answer },
      });
      const res = await request.post(`/__test/cbo/${cboId}/ask-guards`, {
        data: { lang: 'pt', questions: [], copyForField: 'nbs_experience_detail' },
      });
      return (await res.json()).copyForField as string;
    };

    // "Sim" — the yes wording is correct here.
    expect(await mk('Sim')).toContain('já trabalharam');

    // "Não temos certeza" — Ana's wording, and what Periferia Feminista should
    // have been asked.
    const notSure = await mk('Não temos certeza');
    expect(notSure).toContain('pode ser SbN');
    expect(notSure, 'must not presume a yes').not.toContain('já trabalharam');

    // "Ainda não" — defensive: this field should not be required at all on this
    // branch, but if it is ever asked it must not presume a yes either.
    const none = await mk('Ainda não');
    expect(none, 'must not presume a yes').not.toContain('já trabalharam');
  });

  test('the same field asked twice in one call is only shown once', async ({ page, request }) => {
    const api = new TestApi(request);
    const ping = await api.ping();
    test.skip(!ping.fakeModel, 'CBO_FAKE_MODEL is not enabled — skipping deterministic spec.');
    const { cboId, marker: marker1 } = await bootstrap(page);

    // Misturaí's bug: two batches of the SAME unanswered question in one call.
    await api.scriptCbo(cboId, [[
      {
        op: 'ask_user',
        question: 'A equipe é paga ou voluntária?',
        options: [{ label: 'Todas voluntárias' }, { label: 'Maioria pagas' }],
      },
      {
        op: 'ask_user',
        question: 'A equipe é paga ou voluntária?',
        options: [{ label: 'Todas voluntárias' }, { label: 'Maioria pagas' }],
      },
    ]]);
    const input = page.getByTestId('cbo-chat-input');
    await input.fill('oi');
    await input.press('Enter');
    await expect(marker1).toHaveAttribute('data-streaming', 'false');

    await expect(page.locator('[data-testid^="cbo-option-"][data-option-label="Todas voluntárias"]'))
      .toHaveCount(1, { timeout: 15_000 });
  });
});
