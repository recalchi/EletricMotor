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
    <div className="flex h-full flex-col">
      <PageHeader
        title="Explorador 3D"
        subtitle="Rotação 360°, zoom, seleção, isolamento, transparência e vista explodida. Arraste para orbitar, role para zoom."
      />
      <div className="mb-2">
        <SceneToolbar
          onPreset={(p) => {
            setPreset(p);
            setNonce((n) => n + 1);
          }}
        />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[240px_1fr_340px]">
        <div className="panel min-h-[240px] p-3 lg:min-h-0">
          <ComponentTree className="h-full" />
        </div>
        <div className="panel relative min-h-[420px] overflow-hidden">
          <VehicleScene preset={preset} presetNonce={nonce} />
          <SensorLegend />
        </div>
        <div className="panel min-h-0 overflow-auto p-4">
          <ComponentPanel />
        </div>
      </div>
    </div>
  );
}
