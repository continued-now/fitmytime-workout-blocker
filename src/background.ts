import { CalendarService } from './services/calendarService';
import { WorkoutEngine } from './services/workoutEngine';
import { StorageManager } from './utils/storage';
import { GoogleAuthService } from './services/googleAuth';
import { CustomExercise, PersonalRecord } from './types';
import { addDays } from 'date-fns';

const TRACKER_BASE_URL = 'https://fitmytime.app/tracker.html';

class BackgroundService {
  private calendarService: CalendarService;
  private workoutEngine: WorkoutEngine;
  private storageManager: StorageManager;
  private authService: GoogleAuthService;
  private isScanningBackground = false;

  constructor() {
    this.calendarService = CalendarService.getInstance();
    this.workoutEngine = WorkoutEngine.getInstance();
    this.storageManager = StorageManager.getInstance();
    this.authService = GoogleAuthService.getInstance();

    this.initialize();
  }

  private async migratePreferencesToSync(): Promise<void> {
    try {
      const syncData: any = await new Promise(resolve =>
        chrome.storage.sync.get(['userPreferences'], resolve)
      );
      if (!syncData.userPreferences) {
        const localData = await this.storageManager.getData();
        if (localData.userPreferences) {
          await new Promise<void>(resolve =>
            chrome.storage.sync.set({ userPreferences: localData.userPreferences }, resolve)
          );
        }
      }
    } catch {
      // storage.sync may not be available in all contexts — silently ignore
    }
  }

  private async initialize() {
    await this.migratePreferencesToSync();

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
    if (this.isScanningBackground) {
      console.log('Daily scan already in progress, skipping');
      return;
    }
    this.isScanningBackground = true;
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
    } finally {
      this.isScanningBackground = false;
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
            } catch (deleteError) {
              console.warn(`Failed to delete calendar event for workout ${workout.id}:`, deleteError);
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

      const personalRecords = await this.storageManager.getPersonalRecords();
      const trackerUrl = this.generateTrackerUrl(suggestion, personalRecords);
      const estCal = suggestion.duration * (suggestion.intensity === 'high' ? 8 : suggestion.intensity === 'medium' ? 6 : 4);
      const eventTitle = `${this.formatWorkoutType(suggestion.type)} | ${suggestion.duration}min | ~${estCal} cal`;
      const eventDescription = this.formatWorkoutDescription(suggestion, personalRecords, trackerUrl);
      const colorId = this.getWorkoutColor(suggestion.type);

      const leadMinutes = preferences?.notifyLeadMinutes ?? 15;
      const eventId = await (this.calendarService as any).addWorkoutEvent(
        eventTitle,
        eventDescription,
        startTime,
        endTime,
        undefined,
        preferences?.targetCalendarId,
        leadMinutes,
        colorId
      );

      // Add to workout history (with rollback on failure)
      try {
        await this.storageManager.addWorkoutToHistory({
          id: eventId,
          date: startTime.toISOString(),
          type: suggestion.type,
          exercises: suggestion.exercises,
          duration: suggestion.duration,
          completed: false,
          notes: `Intensity: ${suggestion.intensity}`,
          targetMuscleGroups: suggestion.targetMuscleGroups
        });
      } catch (historyError) {
        // Rollback: delete the calendar event
        try {
          await (this.calendarService as any).deleteEvent(eventId, preferences?.targetCalendarId);
        } catch {}
        throw historyError;
      }

      // Schedule notification before workout using user preference
      try {
        const alarmName = `workout_notify_${eventId}`;
        const notifyAt = startTime.getTime() - leadMinutes * 60 * 1000;
        if (notifyAt > Date.now()) {
          chrome.alarms.create(alarmName, { when: notifyAt });
        }
      } catch (alarmError) {
        console.warn('Failed to create alarm, workout still scheduled:', alarmError);
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

  private getWorkoutColor(type: string): string {
    const colorMap: Record<string, string> = {
      upper_body_strength: '11', // Tomato
      lower_body_strength: '6',  // Tangerine
      cardio: '7',               // Peacock
      hiit: '4',                 // Flamingo
      flexibility: '2',          // Sage
      full_body: '9',            // Blueberry
      core: '5',                 // Banana
    };
    return colorMap[type] || '7';
  }

  private getWarmupCooldown(type: string): { warmup: string; cooldown: string } {
    const warmups: Record<string, string> = {
      upper_body_strength: 'Arm circles (30s) > Shoulder rolls (30s) > 10 Jumping jacks > 5 Push-ups',
      lower_body_strength: '10 Bodyweight squats > Leg swings (30s/side) > Hip circles (30s) > 10 Jumping jacks',
      cardio: 'March in place (30s) > High knees (30s) > Arm circles (20s) > 10 Jumping jacks',
      hiit: 'March in place (30s) > High knees (30s) > Arm circles (20s) > 5 Bodyweight squats',
      flexibility: 'Deep breathing (30s) > Gentle neck rolls > Cat-cow (5 reps) > Standing side stretch',
      full_body: 'Arm circles (30s) > 10 Bodyweight squats > Hip circles (20s) > 10 Jumping jacks',
      core: 'Deep breathing (30s) > Hip circles (30s) > Cat-cow (5 reps) > Dead bug (5/side)',
    };
    const cooldowns: Record<string, string> = {
      upper_body_strength: 'Chest stretch (30s/side) > Tricep stretch (30s/side) > Shoulder stretch (30s/side)',
      lower_body_strength: 'Hamstring stretch (30s/side) > Quad stretch (30s/side) > Calf stretch (30s/side)',
      cardio: 'Walk in place (1 min) > Hamstring stretch (30s/side) > Deep breathing (30s)',
      hiit: 'Walk in place (1 min) > Forward fold (30s) > Child\'s pose (30s)',
      flexibility: 'Savasana (1 min) > Deep breathing (30s)',
      full_body: 'Forward fold (30s) > Chest stretch (30s/side) > Child\'s pose (30s)',
      core: 'Child\'s pose (30s) > Spinal twist (30s/side) > Deep breathing (30s)',
    };
    return {
      warmup: warmups[type] || warmups.full_body,
      cooldown: cooldowns[type] || cooldowns.full_body,
    };
  }

  private generateTrackerUrl(suggestion: any, personalRecords: Record<string, PersonalRecord>): string {
    const payload = {
      t: this.formatWorkoutType(suggestion.type),
      d: suggestion.duration,
      i: suggestion.intensity,
      ex: suggestion.exercises.map((ex: any) => {
        const pr = personalRecords[ex.name];
        const entry: any = { n: ex.name, s: ex.sets, r: ex.reps };
        if (ex.duration) entry.dur = ex.duration;
        if (pr?.weight) {
          entry.pw = pr.weight;
          entry.tw = pr.weight <= 10 ? pr.weight + 2.5 : Math.round(pr.weight * 1.05);
        }
        return entry;
      }),
    };
    const encoded = btoa(JSON.stringify(payload));
    return `${TRACKER_BASE_URL}#${encoded}`;
  }

  private formatWorkoutDescription(
    suggestion: any,
    personalRecords?: Record<string, PersonalRecord>,
    trackerUrl?: string
  ): string {
    const { warmup, cooldown } = this.getWarmupCooldown(suggestion.type);
    let desc = '';

    if (trackerUrl) {
      desc += `Track this workout on your phone:\n${trackerUrl}\n\n`;
    }

    desc += `${this.formatWorkoutType(suggestion.type)} | ${suggestion.intensity} intensity\n`;
    desc += `Target: ${suggestion.targetMuscleGroups.join(', ')}\n`;
    desc += `\n--- WARM-UP (3 min) ---\n${warmup}\n`;
    desc += `\n--- WORKOUT ---\n`;

    for (const exercise of suggestion.exercises) {
      if (exercise.duration) {
        desc += `\n${exercise.name}: ${exercise.sets} sets, ${exercise.duration}s`;
      } else {
        desc += `\n${exercise.name}: ${exercise.sets} sets x ${exercise.reps} reps`;
      }
      if (personalRecords?.[exercise.name]?.weight) {
        const pr = personalRecords[exercise.name];
        const nextWeight = pr.weight <= 10 ? pr.weight + 2.5 : Math.round(pr.weight * 1.05);
        desc += `\n  Previous best: ${pr.sets}x${pr.reps} @ ${pr.weight}lb — Try ${nextWeight}lb`;
      }
    }

    desc += `\n\n--- COOL-DOWN (3 min) ---\n${cooldown}\n`;

    return desc;
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
          chrome.alarms.clear(`workout_notify_${message.workoutId}`);
          await this.storageManager.markWorkoutComplete(message.workoutId);
          await this.storageManager.updateStreakOnComplete();
          // Auto-update personal records for each exercise in the completed workout
          const histForPR = await this.storageManager.getWorkoutHistory();
          const doneWorkout = histForPR.find(w => w.id === message.workoutId);
          if (doneWorkout) {
            for (const ex of doneWorkout.exercises) {
              await this.storageManager.updatePersonalRecord(ex.name, ex.sets, ex.reps, ex.weight ?? 0);
            }
          }
          const unlocked = await this.storageManager.checkAndUnlockBadges();
          sendResponse({ success: true, data: { newlyUnlocked: unlocked } });
          break;
        }

        case 'RATE_WORKOUT': {
          chrome.alarms.clear(`workout_notify_${message.workoutId}`);
          await this.storageManager.markWorkoutComplete(message.workoutId, message.rating, message.postNotes);
          await this.storageManager.updateStreakOnComplete();
          // Auto-update personal records for each exercise in the rated workout
          const histForRatePR = await this.storageManager.getWorkoutHistory();
          const ratedWorkout = histForRatePR.find(w => w.id === message.workoutId);
          if (ratedWorkout) {
            for (const ex of ratedWorkout.exercises) {
              await this.storageManager.updatePersonalRecord(ex.name, ex.sets, ex.reps, ex.weight ?? 0);
            }
          }
          const newlyUnlocked = await this.storageManager.checkAndUnlockBadges();
          sendResponse({ success: true, data: { newlyUnlocked } });
          break;
        }

        case 'SKIP_WORKOUT': {
          chrome.alarms.clear(`workout_notify_${message.workoutId}`);
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
          const rLeadMinutes = prefs?.notifyLeadMinutes ?? 15;
          // Clear old notification alarm and delete old calendar event
          chrome.alarms.clear(`workout_notify_${message.workoutId}`);
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
          const now = new Date();
          if (rStart < now) {
            sendResponse({ success: false, error: 'Cannot reschedule to the past' });
            break;
          }
          if (rEnd <= rStart) {
            sendResponse({ success: false, error: 'End time must be after start time' });
            break;
          }
          const rPRs = await this.storageManager.getPersonalRecords();
          const rTrackerUrl = this.generateTrackerUrl(rSuggestion, rPRs);
          const rEstCal = rSuggestion.duration * (rSuggestion.intensity === 'high' ? 8 : rSuggestion.intensity === 'medium' ? 6 : 4);
          const rColorId = this.getWorkoutColor(rSuggestion.type);
          const rId = await (this.calendarService as any).addWorkoutEvent(
            `${this.formatWorkoutType(rSuggestion.type)} | ${rSuggestion.duration}min | ~${rEstCal} cal`,
            this.formatWorkoutDescription(rSuggestion, rPRs, rTrackerUrl),
            rStart,
            rEnd,
            undefined,
            prefs?.targetCalendarId,
            rLeadMinutes,
            rColorId
          );
          await this.storageManager.addWorkoutToHistory({
            id: rId,
            date: rStart.toISOString(),
            type: rSuggestion.type,
            exercises: rSuggestion.exercises,
            duration: rSuggestion.duration,
            completed: false,
            notes: `Intensity: ${rSuggestion.intensity}`,
            targetMuscleGroups: rSuggestion.targetMuscleGroups
          });
          // Schedule new notification alarm
          const rNotifyAt = rStart.getTime() - rLeadMinutes * 60 * 1000;
          if (rNotifyAt > Date.now()) {
            chrome.alarms.create(`workout_notify_${rId}`, { when: rNotifyAt });
          }
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

        case 'DELETE_CUSTOM_EXERCISE': {
          await this.storageManager.deleteCustomExercise(message.name);
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

        case 'GET_FREE_SLOTS': {
          const fsPrefs = await this.storageManager.getUserPreferences();
          if (!fsPrefs) { sendResponse({ success: false, error: 'No preferences set' }); break; }
          const fsNow = new Date();
          const fsEnd = new Date(fsNow.getTime() + 72 * 60 * 60 * 1000); // next 72 hours
          const fsSlots = await this.calendarService.findFreeTimeSlots(
            fsNow, fsEnd,
            fsPrefs.minDuration,
            fsPrefs.workoutDays,
            fsPrefs.timeWindows.map(tw => ({ start: tw.startTime, end: tw.endTime }))
          );
          sendResponse({ success: true, data: fsSlots });
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
