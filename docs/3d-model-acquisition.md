# Plano de aquisição do modelo 3D definitivo

O modelo atual é uma **aproximação geométrica procedural** (`src/features/vehicle-3d/MotorcycleModel.tsx`),
identificada na tela como "MODELO PROVISÓRIO — não é CAD". As proporções vêm das dimensões aproximadas das pranchas.

## Caminho para o modelo fiel
1. **Referências reais**: fotos ortogonais (lateral E/D, frente, traseira, topo) da moto do proprietário, com escala;
   medidas-chave (entre-eixos, altura do banco, diâmetro de roda, largura do guidão).
2. **Fonte do modelo**: modelagem autoral em Blender a partir das fotos, fotogrametria/scan 3D, ou modelo comercial
   com licença que permita o uso — nunca um modelo sem licença.
3. **Requisitos do GLB**:
   - malhas nomeadas exatamente com os `componentId` do catálogo (`battery-a`, `hub-motor`, `fairing-side-l`, …);
   - origem no chão, X = frente, Y = cima, unidades em metros;
   - LOD 0/1, texturas ≤ 2K, compressão Draco/meshopt, < 15 MB;
   - peças internas somente onde a posição tiver sido verificada.
4. **Integração**: carregar com `useGLTF` e mapear `node.name → componentId`, mantendo o componente `Part`
   (seleção, vista explodida, foco por modo).
