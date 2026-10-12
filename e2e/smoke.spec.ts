import { expect, test } from '@playwright/test';

test('demo: login, simulador, seleção de componente', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('enter-demo').click();
  await expect(page.getByText('Central de Controle').first()).toBeVisible();

  // Sem fonte: nada de números inventados
  await expect(page.getByText('INDISPONÍVEL').first()).toBeVisible();

  await page.getByRole('link', { name: 'Laboratório' }).click();
  await page.getByTestId('sim-play').click();
  await expect(page.getByText('MODO SIMULAÇÃO — DADOS FICTÍCIOS DE DEMONSTRAÇÃO')).toBeVisible();

  await page.getByRole('link', { name: 'Explorador 3D' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Bateria A' }).first().click();
  await expect(page.getByTestId('component-panel')).toContainText('Bateria A');
  await expect(page.getByTestId('component-panel')).toContainText('SIMULADO');
});
