import { StorageData, UserPreferences, WorkoutHistory, PersonalRecord, CustomExercise, BADGE_DEFINITIONS } from '../types';

export class StorageManager {
  private static instance: StorageManager;

  private constructor() {}

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  async getData(): Promise<StorageData> {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (result) => {
        const data: StorageData = {
          workoutHistory: [],
          isOnboarded: false,
          ...result
        };
        resolve(data);
      });
    });
  }

  async setData(data: Partial<StorageData>): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  }

  private async getSyncPrefs(): Promise<UserPreferences | undefined> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['userPreferences'], (result) => {
        resolve(result.userPreferences as UserPreferences | undefined);
      });
    });
  }

  private async setSyncPrefs(preferences: UserPreferences): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ userPreferences: preferences }, resolve);
    });
  }

  async getUserPreferences(): Promise<UserPreferences | undefined> {
    // Try sync storage first (cross-device), fall back to local
    try {
      const syncPrefs = await this.getSyncPrefs();
      if (syncPrefs) return syncPrefs;
    } catch {
      // storage.sync not available in this context — fall through
    }
    const data = await this.getData();
    return data.userPreferences;
  }

  async setUserPreferences(preferences: UserPreferences): Promise<void> {
    // Write to both: sync for cross-device, local as offline fallback
    try { await this.setSyncPrefs(preferences); } catch { /* ignore sync errors */ }
    await this.setData({ userPreferences: preferences });
  }

  async getWorkoutHistory(): Promise<WorkoutHistory[]> {
    const data = await this.getData();
    return data.workoutHistory || [];
  }

  async addWorkoutToHistory(workout: WorkoutHistory): Promise<void> {
    const history = await this.getWorkoutHistory();
    const newHistory = [workout, ...history].slice(0, 100); // Keep last 100
    await this.setData({ workoutHistory: newHistory });
  }

  async markWorkoutComplete(workoutId: string, rating?: number, postNotes?: string): Promise<void> {
    const history = await this.getWorkoutHistory();
    const updatedHistory = history.map(workout => {
      if (workout.id === workoutId) {
        const updated: WorkoutHistory = { ...workout, completed: true };
        if (rating !== undefined) updated.rating = rating;
        if (postNotes !== undefined) updated.postNotes = postNotes;
        return updated;
      }
      return workout;
    });
    await this.setData({ workoutHistory: updatedHistory });
  }

  async isOnboarded(): Promise<boolean> {
    const data = await this.getData();
    return data.isOnboarded || false;
  }

  async setOnboarded(): Promise<void> {
    await this.setData({ isOnboarded: true });
  }

  async getGoogleToken(): Promise<string | undefined> {
    const data = await this.getData();
    return data.googleToken;
  }

  async setGoogleToken(token: string): Promise<void> {
    await this.setData({ googleToken: token });
  }

  async clearGoogleToken(): Promise<void> {
    await this.setData({ googleToken: undefined });
  }

  async skipWorkout(workoutId: string): Promise<void> {
    const data = await this.getData();
    data.workoutHistory = data.workoutHistory.map(w =>
      w.id === workoutId ? { ...w, skipped: true } : w
    );
    await this.setData({ workoutHistory: data.workoutHistory });
  }

  async updateStreakOnComplete(): Promise<{ currentStreak: number; longestStreak: number }> {
    const data = await this.getData();
    const today = new Date().toISOString().split('T')[0];
    const last = data.lastWorkoutDate;
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let current = data.currentStreak ?? 0;
    if (last === today) {
      // Already counted today — no change
    } else if (last === yesterday) {
      current += 1;
    } else {
      current = 1;
    }
    const longest = Math.max(current, data.longestStreak ?? 0);
    await this.setData({ currentStreak: current, longestStreak: longest, lastWorkoutDate: today });
    return { currentStreak: current, longestStreak: longest };
  }

  // ── Personal Records ──────────────────────────────────────────────────────

  async getPersonalRecords(): Promise<Record<string, PersonalRecord>> {
    const data = await this.getData();
    return data.personalRecords ?? {};
  }

  async updatePersonalRecord(exerciseName: string, sets: number, reps: number, weight: number): Promise<boolean> {
    const records = await this.getPersonalRecords();
    const existing = records[exerciseName];

    // A new PR is recorded when weight is greater, or weight equals and volume (sets*reps) is greater
    const isNewPR =
      !existing ||
      weight > existing.weight ||
      (weight === existing.weight && sets * reps > existing.sets * existing.reps);

    if (isNewPR) {
      const updated: Record<string, PersonalRecord> = {
        ...records,
        [exerciseName]: { sets, reps, weight, date: new Date().toISOString() }
      };
      await this.setData({ personalRecords: updated });
    }

    return isNewPR;
  }

  // ── Badges ────────────────────────────────────────────────────────────────

  async getUnlockedBadges(): Promise<string[]> {
    const data = await this.getData();
    return data.unlockedBadges ?? [];
  }

  async unlockBadge(badgeId: string): Promise<void> {
    const current = await this.getUnlockedBadges();
    if (!current.includes(badgeId)) {
      await this.setData({ unlockedBadges: [...current, badgeId] });
    }
  }

  async checkAndUnlockBadges(): Promise<string[]> {
    const data = await this.getData();
    const history = data.workoutHistory ?? [];
    const already = data.unlockedBadges ?? [];

    const completedWorkouts = history.filter(w => w.completed && !w.skipped);
    const totalMinutes = completedWorkouts.reduce((sum, w) => sum + (w.duration ?? 0), 0);
    const currentStreak = data.currentStreak ?? 0;

    const shouldUnlock = (id: string): boolean => {
      if (already.includes(id)) return false;
      switch (id) {
        case 'first_workout':  return completedWorkouts.length >= 1;
        case 'workouts_5':     return completedWorkouts.length >= 5;
        case 'workouts_10':    return completedWorkouts.length >= 10;
        case 'workouts_50':    return completedWorkouts.length >= 50;
        case 'minutes_100':    return totalMinutes >= 100;
        case 'streak_7':       return currentStreak >= 7;
        case 'streak_30':      return currentStreak >= 30;
        default:               return false;
      }
    };

    const newlyUnlocked = BADGE_DEFINITIONS
      .map(b => b.id)
      .filter(id => shouldUnlock(id));

    if (newlyUnlocked.length > 0) {
      await this.setData({ unlockedBadges: [...already, ...newlyUnlocked] });
    }

    return newlyUnlocked;
  }

  // ── Custom Exercises ──────────────────────────────────────────────────────

  async getCustomExercises(): Promise<CustomExercise[]> {
    const data = await this.getData();
    return data.customExercises ?? [];
  }

  async addCustomExercise(exercise: CustomExercise): Promise<void> {
    const current = await this.getCustomExercises();
    await this.setData({ customExercises: [...current, exercise] });
  }
}
