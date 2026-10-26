import type { Metadata } from 'next';
import Showcase from './Showcase';

export const metadata: Metadata = {
    title: 'Design showcase · Custom Tester',
    description: 'Every styled element in the app, today and in two proposed directions',
};

export default function DesignPage() {
    return <Showcase />;
}
