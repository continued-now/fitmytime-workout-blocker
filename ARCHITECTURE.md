# FitMyTime Architecture Guide

## Overview

FitMyTime is built with a modular architecture that separates concerns and enables easy upgrades. The core system is designed to be extensible, allowing for future AI-powered enhancements while maintaining backward compatibility.

## Core Architecture

### 1. Service Layer Pattern

All business logic is encapsulated in service classes that follow the singleton pattern:

```typescript
// Base service interface
interface IWorkoutService {
  suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion>;
}

// Current implementation
class WorkoutEngine implements IWorkoutService {
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    // Rules-based logic
  }
}

// Future AI implementation
class AIWorkoutEngine implements IWorkoutService {
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    // AI-powered suggestions
  }
}
```

### 2. Dependency Injection

Services are injected through a service locator pattern:

```typescript
class ServiceContainer {
  private static instance: ServiceContainer;
  private services: Map<string, any> = new Map();

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer();
    }
    return ServiceContainer.instance;
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  get<T>(name: string): T {
    return this.services.get(name);
  }
}
```

## Modular Components

### 1. Workout Engine

**Current**: Rules-based engine with predefined exercise libraries
**Future**: AI-powered engine with machine learning

```typescript
// Current implementation
class WorkoutEngine {
  private exerciseLibrary: ExerciseLibrary;
  
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    // 1. Analyze workout history
    // 2. Apply rules-based logic
    // 3. Filter by equipment/restrictions
    // 4. Return suggestion
  }
}

// Future AI implementation
class AIWorkoutEngine extends WorkoutEngine {
  private aiService: AIService;
  
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    // 1. Analyze user patterns with ML
    // 2. Generate personalized workout
    // 3. Optimize for goals and progress
    // 4. Return AI-enhanced suggestion
  }
}
```

### 2. Calendar Service

**Current**: Google Calendar API integration
**Future**: Multi-calendar support with AI scheduling

```typescript
// Current implementation
class CalendarService {
  async findFreeTimeSlots(): Promise<FreeTimeSlot[]> {
    // Google Calendar API calls
  }
}

// Future implementation
class AICalendarService extends CalendarService {
  async findOptimalTimeSlots(): Promise<FreeTimeSlot[]> {
    // AI-powered time slot optimization
    // Consider energy levels, weather, etc.
  }
}
```

### 3. Exercise Library

**Current**: Static JSON-based exercise database
**Future**: Dynamic AI-curated exercise recommendations

```typescript
// Current implementation
class StaticExerciseLibrary {
  getExercises(type: WorkoutType): Exercise[] {
    return this.exerciseDatabase[type];
  }
}

// Future implementation
class AIExerciseLibrary {
  async getPersonalizedExercises(
    userProfile: UserProfile,
    goals: FitnessGoal,
    equipment: string[]
  ): Promise<Exercise[]> {
    // AI-generated exercise recommendations
    // Based on user performance, preferences, and goals
  }
}
```

## Plugin System

### 1. Exercise Provider Plugins

```typescript
interface ExerciseProvider {
  name: string;
  getExercises(filters: ExerciseFilters): Promise<Exercise[]>;
  getExerciseDetails(id: string): Promise<ExerciseDetails>;
}

// Built-in provider
class BuiltInExerciseProvider implements ExerciseProvider {
  // Current static exercise library
}

// External API provider
class WgerExerciseProvider implements ExerciseProvider {
  // Integration with Wger API
}

// AI provider
class AIExerciseProvider implements ExerciseProvider {
  // AI-generated exercises
}
```

### 2. Scheduling Algorithm Plugins

```typescript
interface SchedulingAlgorithm {
  name: string;
  findOptimalSlots(
    calendar: Calendar,
    preferences: UserPreferences
  ): Promise<TimeSlot[]>;
}

// Current algorithm
class BasicSchedulingAlgorithm implements SchedulingAlgorithm {
  // Simple time slot detection
}

// AI algorithm
class AISchedulingAlgorithm implements SchedulingAlgorithm {
  // ML-powered scheduling optimization
}
```

### 3. Notification System Plugins

```typescript
interface NotificationProvider {
  name: string;
  sendNotification(workout: WorkoutEvent): Promise<void>;
}

// Current implementation
class ChromeNotificationProvider implements NotificationProvider {
  // Browser notifications
}

// Future implementations
class SmartNotificationProvider implements NotificationProvider {
  // AI-powered notification timing
}
```

## AI Integration Strategy

### Phase 1: Data Collection (Current)
- Track workout completion rates
- Monitor user preferences and changes
- Collect performance metrics
- Build user behavior patterns

### Phase 2: Basic AI Features
- Personalized workout recommendations
- Smart time slot optimization
- Exercise difficulty adjustment
- Progress tracking and insights

### Phase 3: Advanced AI Features
- Predictive workout scheduling
- Dynamic exercise generation
- Real-time form feedback (with camera)
- Social workout matching

## Implementation Guide

### 1. Adding AI Workout Engine

```typescript
// 1. Create AI service interface
interface AIService {
  generateWorkout(userProfile: UserProfile): Promise<WorkoutSuggestion>;
  analyzeProgress(history: WorkoutHistory[]): Promise<ProgressAnalysis>;
  predictOptimalTime(userProfile: UserProfile): Promise<TimeSlot[]>;
}

// 2. Implement AI service
class OpenAIWorkoutService implements AIService {
  async generateWorkout(userProfile: UserProfile): Promise<WorkoutSuggestion> {
    // OpenAI API integration
  }
}

// 3. Update service container
const container = ServiceContainer.getInstance();
container.register('workoutService', new AIWorkoutEngine(new OpenAIWorkoutService()));
```

### 2. Adding External Exercise APIs

```typescript
// 1. Create API client
class WgerAPIClient {
  async getExercises(filters: ExerciseFilters): Promise<Exercise[]> {
    // Wger API integration
  }
}

// 2. Create provider
class WgerExerciseProvider implements ExerciseProvider {
  constructor(private apiClient: WgerAPIClient) {}
  
  async getExercises(filters: ExerciseFilters): Promise<Exercise[]> {
    return await this.apiClient.getExercises(filters);
  }
}

// 3. Register provider
const exerciseLibrary = new MultiProviderExerciseLibrary([
  new BuiltInExerciseProvider(),
  new WgerExerciseProvider(new WgerAPIClient())
]);
```

### 3. Adding Machine Learning Features

```typescript
// 1. Create ML service
class MLService {
  async predictWorkoutSuccess(
    userProfile: UserProfile,
    workout: WorkoutSuggestion
  ): Promise<number> {
    // ML model prediction
  }
  
  async recommendNextWorkout(
    history: WorkoutHistory[]
  ): Promise<WorkoutType> {
    // ML-based recommendation
  }
}

// 2. Integrate with workout engine
class MLWorkoutEngine extends WorkoutEngine {
  constructor(private mlService: MLService) {
    super();
  }
  
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    const baseSuggestion = await super.suggestWorkout(preferences);
    const successProbability = await this.mlService.predictWorkoutSuccess(
      preferences,
      baseSuggestion
    );
    
    // Adjust suggestion based on ML prediction
    return this.optimizeSuggestion(baseSuggestion, successProbability);
  }
}
```

## Configuration Management

### Environment-based Configuration

```typescript
interface AppConfig {
  aiEnabled: boolean;
  exerciseProviders: string[];
  schedulingAlgorithm: string;
  notificationProvider: string;
}

// Development config
const devConfig: AppConfig = {
  aiEnabled: false,
  exerciseProviders: ['builtin'],
  schedulingAlgorithm: 'basic',
  notificationProvider: 'chrome'
};

// Production config
const prodConfig: AppConfig = {
  aiEnabled: true,
  exerciseProviders: ['builtin', 'wger', 'ai'],
  schedulingAlgorithm: 'ai',
  notificationProvider: 'smart'
};
```

## Testing Strategy

### 1. Unit Tests
- Test each service in isolation
- Mock external dependencies
- Test plugin interfaces

### 2. Integration Tests
- Test service interactions
- Test plugin loading
- Test configuration changes

### 3. AI Model Tests
- Test ML model accuracy
- Test recommendation quality
- Test performance metrics

## Performance Considerations

### 1. Caching Strategy
```typescript
class CachedWorkoutEngine extends WorkoutEngine {
  private cache = new Map<string, WorkoutSuggestion>();
  
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    const cacheKey = this.generateCacheKey(preferences);
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }
    
    const suggestion = await super.suggestWorkout(preferences);
    this.cache.set(cacheKey, suggestion);
    
    return suggestion;
  }
}
```

### 2. Lazy Loading
```typescript
class LazyExerciseLibrary {
  private providers: Map<string, ExerciseProvider> = new Map();
  
  async getProvider(name: string): Promise<ExerciseProvider> {
    if (!this.providers.has(name)) {
      const provider = await this.loadProvider(name);
      this.providers.set(name, provider);
    }
    
    return this.providers.get(name)!;
  }
}
```

## Migration Strategy

### 1. Feature Flags
```typescript
class FeatureManager {
  isEnabled(feature: string): boolean {
    return this.config.features.includes(feature);
  }
}

// Usage
if (featureManager.isEnabled('ai_workouts')) {
  return new AIWorkoutEngine();
} else {
  return new WorkoutEngine();
}
```

### 2. Gradual Rollout
- Start with AI features for power users
- A/B test AI vs rules-based recommendations
- Gradually increase AI adoption based on metrics

### 3. Fallback Strategy
```typescript
class FallbackWorkoutEngine implements IWorkoutService {
  constructor(
    private primaryEngine: IWorkoutService,
    private fallbackEngine: IWorkoutService
  ) {}
  
  async suggestWorkout(preferences: UserPreferences): Promise<WorkoutSuggestion> {
    try {
      return await this.primaryEngine.suggestWorkout(preferences);
    } catch (error) {
      console.warn('Primary engine failed, using fallback:', error);
      return await this.fallbackEngine.suggestWorkout(preferences);
    }
  }
}
```

This architecture ensures that FitMyTime can evolve from a rules-based system to an AI-powered platform while maintaining stability and user experience. 