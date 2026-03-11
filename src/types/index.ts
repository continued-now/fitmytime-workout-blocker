export interface UserPreferences {
  fitnessGoal: FitnessGoal;
  workoutDays: string[];
  timeWindows: TimeWindow[];
  minDuration: number; // in minutes
  maxDuration: number; // in minutes
  restrictions: string[];
  equipment: string[];
  injuries: string[];
  dislikedExercises: string[];
  weeklyGoal?: number; // target workouts per week
  notifyLeadMinutes?: number; // 5 | 10 | 15 | 30
  targetCalendarId?: string; // which calendar to write events to (default: 'primary')
}

export type FitnessGoal =
  | 'weight_loss'
  | 'muscle_gain'
  | 'general_fitness'
  | 'flexibility'
  | 'custom';

export interface TimeWindow {
  day: string;
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
}

export interface WorkoutHistory {
  id: string;
  date: string;
  type: WorkoutType;
  exercises: Exercise[];
  duration: number;
  completed: boolean;
  skipped?: boolean;
  notes?: string;
  rating?: number; // 1–5 after completion
  postNotes?: string; // optional post-workout notes
}

export type WorkoutType =
  | 'upper_body_strength'
  | 'lower_body_strength'
  | 'cardio'
  | 'hiit'
  | 'flexibility'
  | 'full_body'
  | 'core';

export interface Exercise {
  name: string;
  sets: number;
  reps: number;
  duration?: number; // for timed exercises
  weight?: number;
  notes?: string;
  muscleGroup?: string; // for swap feature
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
}

export interface FreeTimeSlot {
  startTime: string;
  endTime: string;
  duration: number; // in minutes
}

export interface WorkoutSuggestion {
  type: WorkoutType;
  exercises: Exercise[];
  duration: number;
  intensity: 'low' | 'medium' | 'high';
  targetMuscleGroups: string[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
}

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
}

export interface PersonalRecord {
  sets: number;
  reps: number;
  weight: number;
  date: string;
}

export interface CustomExercise {
  name: string;
  category: WorkoutType;
  equipment: string[];
  sets: number;
  reps: number;
  muscleGroup?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const BADGE_DEFINITIONS: Badge[] = [
  { id: 'first_workout', name: 'First Step', description: 'Complete your first workout', icon: '🎯' },
  { id: 'workouts_5', name: 'Getting Started', description: 'Complete 5 workouts', icon: '💪' },
  { id: 'workouts_10', name: 'Committed', description: 'Complete 10 workouts', icon: '🏅' },
  { id: 'workouts_50', name: 'Dedicated', description: 'Complete 50 workouts', icon: '🏆' },
  { id: 'minutes_100', name: 'Century Club', description: 'Log 100 minutes of exercise', icon: '⏱️' },
  { id: 'streak_7', name: 'Week Warrior', description: '7-day streak', icon: '🔥' },
  { id: 'streak_30', name: 'Monthly Master', description: '30-day streak', icon: '🌟' },
];

export interface StorageData {
  userPreferences?: UserPreferences;
  workoutHistory: WorkoutHistory[];
  isOnboarded: boolean;
  googleToken?: string;
  lastCalendarScan?: string;
  currentStreak?: number;
  longestStreak?: number;
  lastWorkoutDate?: string;
  unlockedBadges?: string[]; // badge IDs
  personalRecords?: Record<string, PersonalRecord>; // keyed by exercise name
  customExercises?: CustomExercise[];
}
