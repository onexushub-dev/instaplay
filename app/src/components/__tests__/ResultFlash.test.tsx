import { render, screen } from '@testing-library/react-native';

import { ResultFlash } from '../ResultFlash';

test.each([
  ['saved', 'SALVO!'],
  ['failed', 'NÃO SALVOU'],
  ['timeout', 'SEM RESPOSTA'],
] as const)('%s reads %s in big letters', async (kind, word) => {
  await render(<ResultFlash kind={kind} />);
  expect(screen.getByText(word)).toBeTruthy();
});

test('failed and timeout tell what to do next', async () => {
  const view = await render(<ResultFlash kind="failed" />);
  expect(screen.getByText('Toque de novo')).toBeTruthy();
  await view.rerender(<ResultFlash kind="timeout" />);
  expect(screen.getByText('Confira o celular da câmera')).toBeTruthy();
});
