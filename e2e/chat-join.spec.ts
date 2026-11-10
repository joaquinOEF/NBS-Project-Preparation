import { test, expect } from '@playwright/test';
import { chatJoinSeparator } from '../shared/chat-join';

// Two lines of a templated checkpoint must not fuse into one ("…chuva ✓Cooperativa…"),
// and a model token split mid-word must not be torn apart.
test.describe('joining chat chunks into one bubble', () => {
  test('a checkpoint line ending on ✓, bold or a quote gets a paragraph break', () => {
    expect(chatJoinSeparator('Captação de água da chuva ✓', 'Cooperativa 20 de Novembro testou…')).toBe('\n\n');
    expect(chatJoinSeparator('**Jardins de chuva** ✓', 'Agora a gente monta a proposta inicial conjunta')).toBe('\n\n');
    expect(chatJoinSeparator('a indicação foi: **Jardins de chuva**', 'Outra linha')).toBe('\n\n');
    expect(chatJoinSeparator('Ela disse “sim”', 'Seguimos')).toBe('\n\n');
    expect(chatJoinSeparator('Fechado.', 'Próximo')).toBe('\n\n');
  });

  test('a token split mid-word or mid-sentence is joined as is', () => {
    expect(chatJoinSeparator('Capta', 'ção')).toBe('');
    expect(chatJoinSeparator('a solução é', ' boa')).toBe('');
    expect(chatJoinSeparator('a solução ', 'é boa')).toBe('');
    expect(chatJoinSeparator('', 'Oi')).toBe('');
  });
});
