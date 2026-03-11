import { CalendarService } from './services/calendarService';
import { WorkoutEngine } from './services/workoutEngine';
import { StorageManager } from './utils/storage';
import { GoogleAuthService } from './services/googleAuth';
import { CustomExercise } from './types';
import { addDays } from 'date-fns';

class BackgroundService {
  private calendarService: CalendarService;
  private workoutEngine: WorkoutEngine;
  private storageManager: StorageManager;
  private authService: GoogleAuthService;

  constructor() {
    this.calendarService = CalendarService.getInstance();
    this.workoutEngine = WorkoutEngine.getInstance();
    this.storageManager = StorageManager.getInstance();
    this.authService = GoogleAuthService.getInstance();

    this.initialize();
  }

  private async initialize() {
    // Set up daily alarm for calendar scanning
    chrome.alarms.create('dailyCalendarScan', {
      delayInMinutes: 1, // Run first scan after 1 minute
      periodInMinutes: 24 * 60 // Then every 24 hours
    });

    // Listen for alarm
    chrome.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === 'dailyCalendarScan') {
        this.performDailyScan();
      } else if (alarm.name.startsWith('workout_notify_')) {
        const workoutId = alarm.name.replace('workout_notify_', '');
        const history = await this.storageManager.getWorkoutHistory();
        const workout = history.find(w => w.id === workoutId);
        if (workout && !workout.completed && !workout.skipped) {
          const prefs = await this.storageManager.getUserPreferences();
          const leadMinutes = prefs?.notifyLeadMinutes ?? 15;
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Workout starting soon',
            message: `Your ${workout.duration}-min ${workout.type.replace(/_/g, ' ')} starts in ${leadMinutes} minutes.`,
            priority: 1
          });
        }
      }
    });

    // Listen for messages from popup/content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  private async performDailyScan() {
    try {
      console.log('Starting daily calendar scan...');

      // Check if user is authenticated
      const isAuthenticated = await this.authService.isAuthenticated();
      if (!isAuthenticated) {
        console.log('User not authenticated, skipping calendar scan');
        return;
      }

      // Get user preferences
      const preferences = await this.storageManager.getUserPreferences();
      if (!preferences) {
        console.log('No user preferences found, skipping calendar scan');
        return;
      }

      // Smart reschedule: mark past unfinished workouts as skipped
      await this.smartReschedule(preferences);

      // Scan next 48 hours for free time slots
      const now = new Date();
      const endDate = addDays(now, 2);

      const freeSlots = await this.calendarService.findFreeTimeSlots(
        now,
        endDate,
        preferences.minDuration,
        preferences.workoutDays,
        preferences.timeWindows.map(tw => ({
          start: tw.startTime,
          end: tw.endTime
        }))
      );

      console.log(`Found ${freeSlots.length} free time slots`);

      // Generate workout suggestions for each slot
      for (const slot of freeSlots) {
        await this.scheduleWorkoutForSlot(slot, preferences);
      }

      // Update last scan time
      await this.storageManager.setData({
        lastCalendarScan: new Date().toISOString()
      });

      console.log('Daily calendar scan completed successfully');
    } catch (error) {
      console.error('Error during daily calendar scan:', error);
    }
  }

  private async smartReschedule(preferences: any) {
    try {
      const history = await this.storageManager.getWorkoutHistory();
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;

      for (const workout of history) {
        if (!workout.completed && !workout.skipped) {
          const workoutTime = new Date(workout.date).getTime();
          if (workoutTime < twoHoursAgo) {
            // Mark as skipped
            await this.storageManager.skipWorkout(workout.id);
            // Try to delete the calendar event
            try {
              await (this.calendarService as any).deleteEvent(workout.id, preferences?.targetCalendarId);
            } catch {
              // Silently ignore — event may not exist
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during smart reschedule:', error);
    }
  }

  private async scheduleWorkoutForSlot(slot: any, preferences: any) {
    try {
      // Deduplication: skip if there's already a pending workout within the last 18 hours
      const existingHistory = await this.storageManager.getWorkoutHistory();
      const eighteenHoursAgo = Date.now() - 18 * 60 * 60 * 1000;
      const hasPendingRecent = existingHistory.some(w => {
        if (w.completed || w.skipped) return false;
        return new Date(w.date).getTime() > eighteenHoursAgo;
      });
      if (hasPendingRecent) {
        console.log('Skipping slot — recent pending workout already exists');
        return;
      }

      // Generate workout suggestion
      const suggestion = await this.workoutEngine.suggestWorkout(
        Math.min(slot.duration, preferences.maxDuration),
        preferences.fitnessGoal,
        preferences.equipment,
        [...(preferences.restrictions || []), ...(preferences.dislikedExercises || [])]
      );

      // Create calendar event
      const startTime = new Date(slot.startTime);
      const endTime = new Date(slot.endTime);

      const eventTitle = `Workout: ${this.formatWorkoutType(suggestion.type)}`;
      const eventDescription = this.formatWorkoutDescription(suggestion);

      const eventId = await (this.calendarService as any).addWorkoutEvent(
        eventTitle,
        eventDescription,
        startTime,
        endTime,
        undefined,
        preferences?.targetCalendarId
      );

      // Add to workout history
      await this.storageManager.addWorkoutToHistory({
        id: eventId,
        date: startTime.toISOString(),
        type: suggestion.type,
        exercises: suggestion.exercises,
        duration: suggestion.duration,
        completed: false,
        notes: `Intensity: ${suggestion.intensity}`
      });

      // Schedule notification before workout using user preference
      const leadMinutes = preferences?.notifyLeadMinutes ?? 15;
      const alarmName = `workout_notify_${eventId}`;
      const notifyAt = startTime.getTime() - leadMinutes * 60 * 1000;
      if (notifyAt > Date.now()) {
        chrome.alarms.create(alarmName, { when: notifyAt });
      }

      console.log(`Scheduled workout: ${eventTitle} at ${startTime.toLocaleString()}`);
    } catch (error) {
      console.error('Error scheduling workout for slot:', error);
    }
  }

  private formatWorkoutType(type: string): string {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  private formatWorkoutDescription(suggestion: any): string {
    const exercises = suggestion.exercises.map((exercise: any) => {
      if (exercise.duration) {
        return `${exercise.name}: ${exercise.sets} sets, ${exercise.duration}s`;
      } else {
        return `${exercise.name}: ${exercise.sets} sets x ${exercise.reps} reps`;
      }
    }).join('\n');

    return `Workout Type: ${this.formatWorkoutType(suggestion.type)}\n` +
           `Intensity: ${suggestion.intensity}\n` +
           `Target Areas: ${suggestion.targetMuscleGroups.join(', ')}\n\n` +
           `Exercises:\n${exercises}`;
  }

  private async handleMessage(message: any, sender: any, sendResponse: any) {
    try {
      switch (message.type) {
        case 'GET_UPCOMING_WORKOUTS': {
          const workouts = await this.calendarService.getUpcomingWorkouts();
          sendResponse({ success: true, data: workouts });
          break;
        }

        case 'MARK_WORKOUT_COMPLETE': {
          await this.storageManager.markWorkoutComplete(message.workoutId);
          await this.storageManager.updateStreakOnComplete();
          const unlocked = await this.storageManager.checkAndUnlockBadges();
          sendResponse({ success: true, data: { newlyUnlocked: unlocked } });
          break;
        }

        case 'RATE_WORKOUT': {
          await this.storageManager.markWorkoutComplete(message.workoutId, message.rating, message.postNotes);
          await this.storageManager.updateStreakOnComplete();
          const newlyUnlocked = await this.storageManager.checkAndUnlockBadges();
          sendResponse({ success: true, data: { newlyUnlocked } });
          break;
        }

        case 'SKIP_WORKOUT': {
          await this.storageManager.skipWorkout(message.workoutId);
          sendResponse({ success: true });
          break;
        }

        case 'GET_USER_PREFERENCES': {
          const preferences = await this.storageManager.getUserPreferences();
          sendResponse({ success: true, data: preferences });
          break;
        }

        case 'SET_USER_PREFERENCES': {
          await this.storageManager.setUserPreferences(message.preferences);
          sendResponse({ success: true });
          break;
        }

        case 'GET_WORKOUT_HISTORY': {
          const history = await this.storageManager.getWorkoutHistory();
          sendResponse({ success: true, data: history });
          break;
        }

        case 'AUTHENTICATE_GOOGLE': {
          const token = await this.authService.authenticate();
          sendResponse({ success: true, data: { token } });
          break;
        }

        case 'CHECK_AUTH_STATUS': {
          const isAuthenticated = await this.authService.isAuthenticated();
          sendResponse({ success: true, data: { isAuthenticated } });
          break;
        }

        case 'TRIGGER_CALENDAR_SCAN': {
          await this.performDailyScan();
          sendResponse({ success: true });
          break;
        }

        case 'SET_ONBOARDED': {
          await this.storageManager.setOnboarded();
          sendResponse({ success: true });
          break;
        }

        case 'REVOKE_TOKEN': {
          await this.authService.revokeToken();
          sendResponse({ success: true });
          break;
        }

        case 'RESCHEDULE_WORKOUT': {
          const prefs = await this.storageManager.getUserPreferences();
          // Delete old calendar event
          try {
            await (this.calendarService as any).deleteEvent(message.workoutId, prefs?.targetCalendarId);
          } catch {
            // Silently ignore if deletion fails
          }
          // Create new event at new time
          const rSuggestion = await this.workoutEngine.suggestWorkout(
            message.duration,
            prefs!.fitnessGoal,
            prefs!.equipment,
            [...(prefs!.restrictions || []), ...(prefs!.dislikedExercises || [])]
          );
          const rStart = new Date(message.newStartTime);
          const rEnd = new Date(message.newEndTime);
          const rId = await (this.calendarService as any).addWorkoutEvent(
            `Workout: ${this.formatWorkoutType(rSuggestion.type)}`,
            this.formatWorkoutDescription(rSuggestion),
            rStart,
            rEnd,
            undefined,
            prefs?.targetCalendarId
          );
          await this.storageManager.addWorkoutToHistory({
            id: rId,
            date: rStart.toISOString(),
            type: rSuggestion.type,
            exercises: rSuggestion.exercises,
            duration: rSuggestion.duration,
            completed: false,
            notes: `Intensity: ${rSuggestion.intensity}`
          });
          sendResponse({ success: true, data: { newId: rId } });
          break;
        }

        case 'GET_CALENDARS': {
          const calendars = await (this.calendarService as any).getUserCalendars();
          sendResponse({ success: true, data: calendars });
          break;
        }

        case 'GET_CUSTOM_EXERCISES': {
          const customExs = await this.storageManager.getCustomExercises();
          sendResponse({ success: true, data: customExs });
          break;
        }

        case 'ADD_CUSTOM_EXERCISE': {
          await this.storageManager.addCustomExercise(message.exercise as CustomExercise);
          sendResponse({ success: true });
          break;
        }

        case 'GET_PERSONAL_RECORDS': {
          const prs = await this.storageManager.getPersonalRecords();
          sendResponse({ success: true, data: prs });
          break;
        }

        case 'GET_BADGES': {
          const badges = await this.storageManager.getUnlockedBadges();
          sendResponse({ success: true, data: badges });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
}

// Initialize background service
new BackgroundService();
