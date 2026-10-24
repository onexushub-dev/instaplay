import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ClipEdit } from '../ClipEdit';

test('editing has Cancelar · EDITAR · Concluir around the video, the panel, the cut and the tools', async () => {
  const onCancel = jest.fn();
  const onDone = jest.fn();
  await render(
    <ClipEdit
      renderStage={() => <Text>vídeo</Text>}
      onCancel={onCancel}
      onDone={onDone}
      panel={<Text>painel</Text>}
      cut={<Text>corte</Text>}
      toolBar={<Text>ferramentas</Text>}
    />,
  );
  for (const t of ['EDITAR', 'painel', 'corte', 'ferramentas']) expect(screen.getByText(t)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Concluir' }));
  expect(onCancel).toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});
