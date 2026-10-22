// blueprint.ts — official NBEO Part I ABS content matrix, used to weight exam sampling
//
// Source: NBEO "Part I ABS Content Matrix" (April 30, 2026), 350 scored items.
// Each row's weight is the midpoint of its official item range; the midpoints sum to exactly 350.

import { shuffle } from './examUtils';

export const BLUEPRINT_SOURCE = {
    label: 'NBEO Part I ABS Content Matrix (Apr 2026)',
    url: 'https://optometry.org/wp-content/uploads/2026/05/Part-I-ABS_Content-Matrix-20260430.pdf',
};

export const SCORED_ITEMS = 350;

// NBEO tests pharmacology inside the health/disease conditions rather than as its own row. The bank tags
// those questions "Pharmacology", so they get the Pharmacology column's midpoint (11–17% → 49 items),
// taken proportionally from the Normal Health / Disease / Trauma rows.
const PHARM_ITEMS = 49;

export type BlueprintGroup = 'Refractive / Sensory / Oculomotor' | 'Normal Health / Disease / Trauma' | 'Discipline';

export interface BlueprintRow {
    key: string;
    label: string;
    group: BlueprintGroup;
    min: number;
    max: number;
    weight: number; // items out of 350 after the pharmacology carve-out
}

const HEALTH = 'Normal Health / Disease / Trauma' as const;
const REFRACTIVE = 'Refractive / Sensory / Oculomotor' as const;

const RAW_ROWS: Omit<BlueprintRow, 'weight'>[] = [
    { key: 'ametropia', label: 'Ametropia', group: REFRACTIVE, min: 29, max: 39 },
    { key: 'optics', label: 'Ophthalmic Optics / Spectacles', group: REFRACTIVE, min: 17, max: 25 },
    { key: 'cl', label: 'Contact Lenses', group: REFRACTIVE, min: 8, max: 14 },
    { key: 'lowvision', label: 'Low Vision', group: REFRACTIVE, min: 5, max: 9 },
    { key: 'avo', label: 'Accommodation / Vergence / Oculomotor Function', group: REFRACTIVE, min: 10, max: 18 },
    { key: 'amblyopia', label: 'Amblyopia / Strabismus', group: REFRACTIVE, min: 9, max: 17 },
    { key: 'perceptual', label: 'Perceptual Function / Color Vision', group: REFRACTIVE, min: 10, max: 18 },
    { key: 'development', label: 'Visual and Human Development', group: REFRACTIVE, min: 6, max: 10 },
    // The bank's "Ant Seg" category covers both of these NBEO rows, so they share one bucket
    { key: 'antseg', label: 'Lids / Lacrimal / Adnexa / Orbit + Episclera / Sclera / Anterior Uvea', group: HEALTH, min: 20 + 16, max: 28 + 24 },
    { key: 'cornea', label: 'Conjunctiva / Cornea / Refractive Surgery', group: HEALTH, min: 34, max: 50 },
    { key: 'lens', label: 'Lens / Cataract / IOL / Pre- and Post-Operative Care', group: HEALTH, min: 7, max: 13 },
    { key: 'retina', label: 'Retina / Choroid / Vitreous', group: HEALTH, min: 17, max: 25 },
    { key: 'neuro', label: 'Optic Nerve / Neuro-Ophthalmic Pathways', group: HEALTH, min: 14, max: 22 },
    { key: 'glaucoma', label: 'Glaucoma', group: HEALTH, min: 13, max: 21 },
    { key: 'emergency', label: 'Emergencies / Trauma', group: HEALTH, min: 8, max: 14 },
    { key: 'systemic', label: 'Systemic Health', group: HEALTH, min: 55, max: 75 },
];

const HEALTH_TOTAL = RAW_ROWS.filter(r => r.group === HEALTH).reduce((s, r) => s + (r.min + r.max) / 2, 0); // 228
const HEALTH_SCALE = (HEALTH_TOTAL - PHARM_ITEMS) / HEALTH_TOTAL;

export const BLUEPRINT: BlueprintRow[] = [
    ...RAW_ROWS.map(r => ({ ...r, weight: ((r.min + r.max) / 2) * (r.group === HEALTH ? HEALTH_SCALE : 1) })),
    { key: 'pharm', label: 'Pharmacology (tested within the conditions above)', group: 'Discipline', min: 40, max: 60, weight: PHARM_ITEMS },
];

// Bank category → blueprint row. Only the part before "|" matters ("Ametropia | Physiology" → Ametropia).
// Biochem and Microbiology items are basic science applied to systemic conditions, so they share Systemic Health.
const MATCHERS: [RegExp, string][] = [
    [/^ametropia/, 'ametropia'],
    [/^optics/, 'optics'],
    [/^contact lens/, 'cl'],
    [/^low vision/, 'lowvision'],
    [/^accommodation/, 'avo'],
    [/^amblyopia/, 'amblyopia'],
    [/^(preseptual|perceptual|color vision)/, 'perceptual'],
    [/^(development|visual and human)/, 'development'],
    [/^(ant seg|lids|episclera)/, 'antseg'],
    [/^conj/, 'cornea'],
    [/^lens/, 'lens'],
    [/^(post seg|vitreous|retina)/, 'retina'],
    [/^(neuro|optic nerve)/, 'neuro'],
    [/^glaucoma/, 'glaucoma'],
    [/^(ocular emergenc|emergenc)/, 'emergency'],
    [/^(systemic|biochem|microbio)/, 'systemic'],
    [/^pharmacolog/, 'pharm'],
];

export const blueprintKey = (category: string): string | null => {
    const head = category.split('|')[0].trim().toLowerCase();
    return MATCHERS.find(([re]) => re.test(head))?.[1] ?? null;
};

/** Item targets per bucket for an exam of `count`, given which buckets have questions available. */
export const blueprintQuotas = (supply: Record<string, number>, count: number) => {
    // Categories the matrix doesn't know about keep their bank share so they aren't silently dropped
    const totalSupply = Object.values(supply).reduce((s, n) => s + n, 0);
    const weights: Record<string, number> = {};
    Object.keys(supply).forEach(key => {
        if (!supply[key]) return;
        const row = BLUEPRINT.find(r => r.key === key);
        weights[key] = row ? row.weight : (supply[key] / totalSupply) * SCORED_ITEMS;
    });

    const quotas: Record<string, number> = {};
    Object.keys(weights).forEach(k => { quotas[k] = 0; });
    let remaining = Math.min(count, totalSupply);

    // Largest-remainder apportionment, repeated so a short bucket's leftover flows to buckets that have spare questions
    while (remaining > 0) {
        const open = Object.keys(weights).filter(k => quotas[k] < supply[k]);
        if (!open.length) break;
        const wSum = open.reduce((s, k) => s + weights[k], 0);
        const shares = open.map(k => {
            const exact = (weights[k] / wSum) * remaining;
            return { k, base: Math.floor(exact), frac: exact - Math.floor(exact) };
        });
        let extra = remaining - shares.reduce((s, x) => s + x.base, 0);
        shares.sort((a, b) => b.frac - a.frac).forEach(x => { if (extra > 0) { x.base++; extra--; } });

        let placed = 0;
        shares.forEach(({ k, base }) => {
            const take = Math.min(base, supply[k] - quotas[k]);
            quotas[k] += take;
            placed += take;
        });
        remaining -= placed;
        if (placed === 0) break;
    }
    return quotas;
};

/** Draws `count` question ids following the NBEO content matrix instead of the bank's own category mix. */
export const blueprintSample = (pool: { id: string; category: string }[], count: number) => {
    const buckets: Record<string, string[]> = {};
    pool.forEach(p => {
        const key = blueprintKey(p.category) ?? `other:${p.category}`;
        (buckets[key] ||= []).push(p.id);
    });
    const supply = Object.fromEntries(Object.entries(buckets).map(([k, ids]) => [k, ids.length]));
    const quotas = blueprintQuotas(supply, count);
    return shuffle(Object.entries(quotas).flatMap(([k, n]) => shuffle(buckets[k]).slice(0, n)));
};
