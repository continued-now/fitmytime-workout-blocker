import { WorkoutSuggestion, WorkoutType, Exercise, FitnessGoal, WorkoutHistory } from '../types';
import { StorageManager } from '../utils/storage';

export class WorkoutEngine {
  private static instance: WorkoutEngine;
  private storageManager: StorageManager;
  
  private constructor() {
    this.storageManager = StorageManager.getInstance();
  }
  
  static getInstance(): WorkoutEngine {
    if (!WorkoutEngine.instance) {
      WorkoutEngine.instance = new WorkoutEngine();
    }
    return WorkoutEngine.instance;
  }

  async suggestWorkout(
    duration: number,
    goal: FitnessGoal,
    equipment: string[],
    restrictions: string[]
  ): Promise<WorkoutSuggestion> {
    const history = await this.storageManager.getWorkoutHistory();
    const lastWorkout = history[0]; // Most recent workout
    
    // Determine workout type based on history and goals
    const workoutType = this.determineWorkoutType(lastWorkout, goal);
    
    // Get exercises based on type, goal, and equipment
    const exercises = this.getExercises(workoutType, goal, equipment, restrictions, duration);
    
    // Determine intensity based on goal and history
    const intensity = this.determineIntensity(goal, lastWorkout);
    
    // Get target muscle groups
    const targetMuscleGroups = this.getTargetMuscleGroups(workoutType);
    
    return {
      type: workoutType,
      exercises,
      duration,
      intensity,
      targetMuscleGroups
    };
  }

  private determineWorkoutType(lastWorkout: WorkoutHistory | undefined, goal: FitnessGoal): WorkoutType {
    if (!lastWorkout) {
      // First workout - start with full body
      return 'full_body';
    }

    const lastType = lastWorkout.type;
    
    // Avoid repeating the same muscle group two days in a row
    switch (lastType) {
      case 'upper_body_strength':
        return this.getRandomFrom(['lower_body_strength', 'cardio', 'hiit']);
      case 'lower_body_strength':
        return this.getRandomFrom(['upper_body_strength', 'cardio', 'hiit']);
      case 'cardio':
        return this.getRandomFrom(['upper_body_strength', 'lower_body_strength', 'flexibility']);
      case 'hiit':
        return this.getRandomFrom(['upper_body_strength', 'lower_body_strength', 'flexibility']);
      case 'flexibility':
        return this.getRandomFrom(['upper_body_strength', 'lower_body_strength', 'cardio']);
      case 'full_body':
        return this.getRandomFrom(['cardio', 'flexibility', 'core']);
      case 'core':
        return this.getRandomFrom(['upper_body_strength', 'lower_body_strength', 'cardio']);
      default:
        return 'full_body';
    }
  }

  private getExercises(
    type: WorkoutType,
    goal: FitnessGoal,
    equipment: string[],
    restrictions: string[],
    duration: number
  ): Exercise[] {
    const exerciseLibrary = this.getExerciseLibrary();
    let exercises: Exercise[] = [];
    
    switch (type) {
      case 'upper_body_strength':
        exercises = this.filterExercises(
          exerciseLibrary.upperBody,
          equipment,
          restrictions
        );
        break;
      case 'lower_body_strength':
        exercises = this.filterExercises(
          exerciseLibrary.lowerBody,
          equipment,
          restrictions
        );
        break;
      case 'cardio':
        exercises = this.filterExercises(
          exerciseLibrary.cardio,
          equipment,
          restrictions
        );
        break;
      case 'hiit':
        exercises = this.filterExercises(
          exerciseLibrary.hiit,
          equipment,
          restrictions
        );
        break;
      case 'flexibility':
        exercises = this.filterExercises(
          exerciseLibrary.flexibility,
          equipment,
          restrictions
        );
        break;
      case 'full_body':
        exercises = this.filterExercises(
          [...exerciseLibrary.upperBody, ...exerciseLibrary.lowerBody],
          equipment,
          restrictions
        );
        break;
      case 'core':
        exercises = this.filterExercises(
          exerciseLibrary.core,
          equipment,
          restrictions
        );
        break;
    }
    
    // Adjust exercises based on goal
    exercises = this.adjustForGoal(exercises, goal);
    
    // Select appropriate number of exercises based on duration
    const targetExerciseCount = Math.max(3, Math.floor(duration / 10));
    exercises = this.selectExercises(exercises, targetExerciseCount);
    
    return exercises;
  }

  private filterExercises(
    exercises: Exercise[],
    equipment: string[],
    restrictions: string[]
  ): Exercise[] {
    return exercises.filter(exercise => {
      // Parse required equipment from notes (format: 'equipment: dumbbells')
      if (exercise.notes?.startsWith('equipment:')) {
        const required = exercise.notes.replace('equipment:', '').trim();
        if (required !== 'none' && !equipment.includes(required)) {
          return false;
        }
      }

      // Check if exercise is in restrictions/disliked list
      const exerciseName = exercise.name.toLowerCase();
      return !restrictions.some(restriction =>
        restriction && exerciseName.includes(restriction.toLowerCase())
      );
    });
  }

  private adjustForGoal(exercises: Exercise[], goal: FitnessGoal): Exercise[] {
    switch (goal) {
      case 'weight_loss':
        // Focus on compound movements and higher reps
        return exercises.map(exercise => ({
          ...exercise,
          sets: Math.max(3, exercise.sets),
          reps: Math.max(12, exercise.reps)
        }));
      case 'muscle_gain':
        // Focus on progressive overload
        return exercises.map(exercise => ({
          ...exercise,
          sets: Math.max(4, exercise.sets),
          reps: Math.min(8, exercise.reps)
        }));
      case 'general_fitness':
        // Balanced approach
        return exercises;
      case 'flexibility':
        // Focus on stretching and mobility
        return exercises.map(exercise => ({
          ...exercise,
          duration: Math.max(30, exercise.duration || 30)
        }));
      default:
        return exercises;
    }
  }

  private selectExercises(exercises: Exercise[], count: number): Exercise[] {
    const shuffled = [...exercises].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private determineIntensity(goal: FitnessGoal, lastWorkout?: WorkoutHistory): 'low' | 'medium' | 'high' {
    if (!lastWorkout) return 'medium';
    
    // Alternate intensity levels
    const lastIntensity = lastWorkout.notes?.includes('high') ? 'high' : 
                         lastWorkout.notes?.includes('low') ? 'low' : 'medium';
    
    switch (lastIntensity) {
      case 'high':
        return 'low';
      case 'low':
        return 'medium';
      default:
        return 'high';
    }
  }

  private getTargetMuscleGroups(type: WorkoutType): string[] {
    switch (type) {
      case 'upper_body_strength':
        return ['chest', 'back', 'shoulders', 'arms'];
      case 'lower_body_strength':
        return ['quads', 'hamstrings', 'glutes', 'calves'];
      case 'cardio':
        return ['cardiovascular'];
      case 'hiit':
        return ['cardiovascular', 'full_body'];
      case 'flexibility':
        return ['mobility', 'flexibility'];
      case 'full_body':
        return ['full_body'];
      case 'core':
        return ['abs', 'core'];
      default:
        return ['full_body'];
    }
  }

  private getRandomFrom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private getExerciseLibrary() {
    return {
      upperBody: [
        { name: 'Push-ups', sets: 3, reps: 10, notes: 'equipment: none' },
        { name: 'Pull-ups', sets: 3, reps: 5, notes: 'equipment: pull-up bar' },
        { name: 'Dumbbell Rows', sets: 3, reps: 12, notes: 'equipment: dumbbells' },
        { name: 'Dumbbell Press', sets: 3, reps: 10, notes: 'equipment: dumbbells' },
        { name: 'Dips', sets: 3, reps: 8, notes: 'equipment: dip bars' },
        { name: 'Plank', sets: 3, reps: 1, duration: 30, notes: 'equipment: none' }
      ],
      lowerBody: [
        { name: 'Squats', sets: 3, reps: 15, notes: 'equipment: none' },
        { name: 'Lunges', sets: 3, reps: 12, notes: 'equipment: none' },
        { name: 'Deadlifts', sets: 3, reps: 8, notes: 'equipment: barbell' },
        { name: 'Calf Raises', sets: 3, reps: 20, notes: 'equipment: none' },
        { name: 'Glute Bridges', sets: 3, reps: 15, notes: 'equipment: none' },
        { name: 'Wall Sit', sets: 3, reps: 1, duration: 45, notes: 'equipment: none' }
      ],
      cardio: [
        { name: 'Running', sets: 1, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Cycling', sets: 1, reps: 1, duration: 30, notes: 'equipment: bike' },
        { name: 'Jump Rope', sets: 3, reps: 1, duration: 5, notes: 'equipment: jump rope' },
        { name: 'Burpees', sets: 3, reps: 10, notes: 'equipment: none' },
        { name: 'Mountain Climbers', sets: 3, reps: 1, duration: 30, notes: 'equipment: none' }
      ],
      hiit: [
        { name: 'Sprint Intervals', sets: 8, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Tabata Burpees', sets: 8, reps: 1, duration: 20, notes: 'equipment: none' },
        { name: 'High Knees', sets: 4, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Jump Squats', sets: 4, reps: 15, notes: 'equipment: none' }
      ],
      flexibility: [
        { name: 'Hamstring Stretch', sets: 3, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Hip Flexor Stretch', sets: 3, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Shoulder Stretch', sets: 3, reps: 1, duration: 30, notes: 'equipment: none' },
        { name: 'Cat-Cow Stretch', sets: 3, reps: 10, notes: 'equipment: none' },
        { name: 'Child\'s Pose', sets: 3, reps: 1, duration: 60, notes: 'equipment: none' }
      ],
      core: [
        { name: 'Crunches', sets: 3, reps: 15, notes: 'equipment: none' },
        { name: 'Plank', sets: 3, reps: 1, duration: 45, notes: 'equipment: none' },
        { name: 'Russian Twists', sets: 3, reps: 20, notes: 'equipment: none' },
        { name: 'Leg Raises', sets: 3, reps: 12, notes: 'equipment: none' },
        { name: 'Bicycle Crunches', sets: 3, reps: 15, notes: 'equipment: none' }
      ]
    };
  }
} 