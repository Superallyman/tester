// Difficulty labels from everyone's first tries (view question_difficulty). Plain code shared by the API and the UI.

export const MIN_PEOPLE = 3;      // fewer first tries than this and a question isn't labelled
export const EASY_FROM = 70;      // % right on first try
export const HARD_BELOW = 40;

export type Difficulty = 'easy' | 'medium' | 'hard';

export const difficultyOf = (people: number, firstCorrect: number): Difficulty | null => {
    if (people < MIN_PEOPLE) return null;
    const pct = (firstCorrect / people) * 100;
    return pct >= EASY_FROM ? 'easy' : pct < HARD_BELOW ? 'hard' : 'medium';
};

/** SQL condition on a joined question_difficulty row `d` for one label */
export const difficultySql: Record<Difficulty, string> = {
    easy: `d.people >= ${MIN_PEOPLE} and d.first_correct * 100 >= ${EASY_FROM} * d.people`,
    medium: `d.people >= ${MIN_PEOPLE} and d.first_correct * 100 >= ${HARD_BELOW} * d.people and d.first_correct * 100 < ${EASY_FROM} * d.people`,
    hard: `d.people >= ${MIN_PEOPLE} and d.first_correct * 100 < ${HARD_BELOW} * d.people`,
};
