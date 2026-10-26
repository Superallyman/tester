import type { Metadata } from 'next';
import OrbitKit from './OrbitKit';

export const metadata: Metadata = {
    title: 'Orbit design kit',
    description: 'A drop-in UI kit: glass surfaces, Mission-style type. Every component with copyable HTML.',
};

export default function DesignPage() {
    return <OrbitKit />;
}
