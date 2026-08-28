import { test, expect } from '@playwright/test';
import {
  uploadNotice,
  classifyUploadNotice,
  isUnreadableUploadNotice,
  UPLOAD_NOTICE_SIGNATURE,
} from '../shared/cbo-upload-notices';

// ⚠️ UPLOAD-NOTICE-STRANDS-PHOTO-BEAT (JVP, 2026-08-21, w2-scenarios org 1).
//
// After a file is attached, the client posts a notice describing what happened
// to it. The photo beat in cboAgent has to recognise the ones that carried no
// readable text and answer them ITSELF — because any turn that reaches the model
// replaces the pending composer, which takes the "Pronto, pode seguir" chip away.
// The beat already documents that consequence for "Anexar mais".
//
// It happened for real: three unreadable photos, chip gone, `_photos_done` never
// set, and Beat 4's read-back never ran. The conversation stopped moving and the
// scenario timed out waiting for "média do bairro".
//
// The builders and the classifier now derive from the same constants, and these
// tests pin that coupling — so rewording a notice cannot silently stop it being
// recognised, which is the failure that is otherwise invisible until an org is
// stuck mid-upload.

test.describe('CBO upload notices — every notice the client sends is recognised', () => {
  test('each builder round-trips to its own kind', () => {
    expect(classifyUploadNotice(uploadNotice.refused('a.pdf', 'Too large.', 'Send under 10 MB.'))).toBe('refused');
    expect(classifyUploadNotice(uploadNotice.storedUnread('foto.jpg'))).toBe('storedUnread');
    expect(classifyUploadNotice(uploadNotice.transport('doc.docx'))).toBe('transport');
    expect(classifyUploadNotice(uploadNotice.parsed('plano.pdf', 'conteúdo do documento'))).toBe('parsed');
  });

  test('the beat answers the unreadable ones and leaves parsed to the model', () => {
    // These three must never reach the model — its turn eats the pending chip.
    expect(isUnreadableUploadNotice(uploadNotice.refused('a.pdf'))).toBe(true);
    expect(isUnreadableUploadNotice(uploadNotice.storedUnread('foto.jpg'))).toBe(true);
    expect(isUnreadableUploadNotice(uploadNotice.transport('doc.docx'))).toBe(true);
    // This one carries a document the model has to read and fill sections from.
    expect(isUnreadableUploadNotice(uploadNotice.parsed('plano.pdf', 'texto'))).toBe(false);
  });

  test('an ordinary message is not mistaken for a notice', () => {
    for (const text of [
      'A gente trabalha na horta desde 2019.',
      'Aqui é pior',
      'Pronto, pode seguir',
      '',
    ]) {
      expect(classifyUploadNotice(text), `"${text}" must not classify`).toBeNull();
    }
  });

  test('a parsed document quoting another notice still classifies as parsed', () => {
    // The document body is arbitrary text and could contain any wording; the
    // parsed signature appears before it, which is why parsed is checked first.
    const notice = uploadNotice.parsed(
      'ata.pdf',
      `A ata registra: ${UPLOAD_NOTICE_SIGNATURE.storedUnread}, segundo o relato.`,
    );
    expect(classifyUploadNotice(notice)).toBe('parsed');
    expect(isUnreadableUploadNotice(notice)).toBe(false);
  });

  test('every signature really appears in the notice it identifies', () => {
    // The coupling that makes the classifier trustworthy. If a builder is
    // reworded without touching its signature, this is what catches it.
    expect(uploadNotice.refused('x.pdf')).toContain(UPLOAD_NOTICE_SIGNATURE.refused);
    expect(uploadNotice.storedUnread('x.jpg')).toContain(UPLOAD_NOTICE_SIGNATURE.storedUnread);
    expect(uploadNotice.transport('x.docx')).toContain(UPLOAD_NOTICE_SIGNATURE.transport);
    expect(uploadNotice.parsed('x.pdf', 'y')).toContain(UPLOAD_NOTICE_SIGNATURE.parsed);
  });
});
