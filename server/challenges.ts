// Challenges follow the leaderboard switch: they show other people's scores
import { ApiUser, HttpError } from './auth';

export const requireLeaderboard = (user: ApiUser) => {
    if (!user.canSeeLeaderboard) throw new HttpError(403, "Challenges aren't turned on for your account.");
};
