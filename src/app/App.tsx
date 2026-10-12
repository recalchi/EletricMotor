import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import LoginPage from './LoginPage';
import { SessionProvider, useSession } from './session';
import { cloud, wireAdapters } from './telemetry';
import { useApp } from './store';
import { useCollection, useDoc } from '../data/hooks';
import type { DeviceProfile, VehicleProfile } from '../domain/types';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ExplorerPage = lazy(() => import('../features/vehicle-3d/ExplorerPage'));
const DiagnosticsPage = lazy(() => import('../features/diagnostics/DiagnosticsPage'));
const BatteriesPage = lazy(() => import('../features/batteries/BatteriesPage'));
const MotorPage = lazy(() => import('../features/motor-controller/MotorPage'));
const SensorsPage = lazy(() => import('../features/sensors/SensorsPage'));
const TelemetryPage = lazy(() => import('../features/telemetry/TelemetryPage'));
const MaintenancePage = lazy(() => import('../features/maintenance/MaintenancePage'));
const ConnectivityPage = lazy(() => import('../features/connectivity/ConnectivityPage'));
const LabPage = lazy(() => import('../features/simulator/LabPage'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));
const TechnicalReport = lazy(() => import('../features/reports/TechnicalReport'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const ManualPage = lazy(() => import('../features/manual/ManualPage'));

/** Carrega o perfil do veículo persistido para o store. */
function VehicleLoader() {
  const vehicle = useApp((s) => s.vehicle);
  const setVehicle = useApp((s) => s.setVehicle);
  const { value, loaded } = useDoc<VehicleProfile>('vehicle', vehicle);
  useEffect(() => {
    if (loaded) setVehicle(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  return null;
}

/** Mantém o cadastro de dispositivos no store (consultado pelos adaptadores) e liga a nuvem ao usuário. */
function DevicesLoader() {
  const { items } = useCollection<DeviceProfile>('devices');
  const setDevices = useApp((s) => s.setDevices);
  const { session } = useSession();
  useEffect(() => setDevices(items), [items, setDevices]);
  useEffect(() => cloud.attach(session?.mode === 'firebase' ? session.uid : null, 'evs-1'), [session]);
  return null;
}

function Gate() {
  const { session, loading } = useSession();
  useEffect(wireAdapters, []);
  if (loading) return <div className="flex h-full items-center justify-center text-slate-400">Carregando…</div>;
  if (!session) return <LoginPage />;
  return (
    <>
      <VehicleLoader />
      <DevicesLoader />
      <Suspense fallback={<div className="p-6 text-slate-400">Carregando…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="explorador" element={<ExplorerPage />} />
            <Route path="diagnostico" element={<DiagnosticsPage />} />
            <Route path="baterias" element={<BatteriesPage />} />
            <Route path="motor" element={<MotorPage />} />
            <Route path="sensores" element={<SensorsPage />} />
            <Route path="telemetria" element={<TelemetryPage />} />
            <Route path="manutencao" element={<MaintenancePage />} />
            <Route path="conectividade" element={<ConnectivityPage />} />
            <Route path="laboratorio" element={<LabPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="relatorios/tecnico" element={<TechnicalReport />} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="manual" element={<ManualPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </SessionProvider>
  );
}
