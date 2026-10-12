import { useState } from 'react';
import { ComponentPanel } from '../components/ComponentPanel';
import { ComponentTree } from '../components/ComponentTree';
import { PageHeader } from '../../shared/ui';
import { SceneToolbar, SensorLegend } from './SceneToolbar';
import { VehicleScene, type CameraPreset } from './VehicleScene';

export default function ExplorerPage() {
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [nonce, setNonce] = useState(0);
  return (
    <div className="flex flex-col lg:h-full">
      <PageHeader
        title="Explorador 3D"
        subtitle="Arraste para girar, use dois dedos (ou a roda do mouse) para zoom e toque numa peça para ver a ficha."
      />
      <div className="mb-2">
        <SceneToolbar
          onPreset={(p) => {
            setPreset(p);
            setNonce((n) => n + 1);
          }}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[240px_1fr_340px]">
        <div className="panel order-2 max-h-[320px] min-h-[240px] p-3 lg:order-none lg:max-h-none lg:min-h-0">
          <ComponentTree className="h-full" />
        </div>
        {/* No celular o 3D vem primeiro, depois a ficha da peça e a árvore */}
        <div className="panel relative order-first h-[380px] overflow-hidden sm:h-auto sm:min-h-[420px] lg:order-none">
          <VehicleScene preset={preset} presetNonce={nonce} />
          <SensorLegend />
        </div>
        <div className="panel order-1 min-h-0 overflow-auto p-4 lg:order-none">
          <ComponentPanel />
        </div>
      </div>
    </div>
  );
}
