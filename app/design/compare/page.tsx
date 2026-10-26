import type { Metadata } from 'next';
import Showcase from '../Showcase';

export const metadata: Metadata = {
    title: 'Design directions · compare',
    description: 'The app today next to the Glass, Mission and Orbit directions',
};

export default function ComparePage() {
    return <Showcase />;
}
