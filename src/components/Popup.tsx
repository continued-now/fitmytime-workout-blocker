import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CalendarEvent,
  WorkoutHistory,
  UserPreferences,
  Exercise,
  GoogleCalendar,
  PersonalRecord,
  CustomExercise,
  BADGE_DEFINITIONS,
} from '../types';
import { OnboardingModal } from './OnboardingModal';
import { PreferencesForm } from './PreferencesForm';

// --------------- Local helpers ---------------

const MUSCLE_ALTERNATIVES: Record<string, string[]> = {
  chest: ['Push-ups', 'Bench Press', 'Chest Flies', 'Incline Press', 'Dips'],
  back: ['Pull-ups', 'Rows', 'Lat Pulldown', 'Deadlift', 'Face Pulls'],
  legs: ['Squats', 'Lunges', 'Leg Press', 'Step-ups', 'Wall Sit'],
  shoulders: ['Overhead Press', 'Lateral Raises', 'Front Raises', 'Arnold Press', 'Upright Rows'],
  arms: ['Bicep Curls', 'Tricep Dips', 'Hammer Curls', 'Skull Crushers', 'Chin-ups'],
  core: ['Plank', 'Crunches', 'Leg Raises', 'Russian Twists', 'Dead Bug'],
  cardio: ['Jumping Jacks', 'High Knees', 'Burpees', 'Mountain Climbers', 'Jump Rope'],
  general: ['Burpees', 'Jump Squats', 'Push-ups', 'Plank', 'Mountain Climbers'],
};

function toLocalDatetimeValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isToday(isoString: string): boolean {
  const d = new Date(isoString);
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

// --------------- Component ---------------

export const Popup: React.FC = () => {
  // ---- existing state ----
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<CalendarEvent[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistory[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnboarded, setIsOnboarded] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastCalendarScan, setLastCalendarScan] = useState<string | undefined>();
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editPreferences, setEditPreferences] = useState<Partial<UserPreferences>>({});
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'settings' | 'calendar'>('upcoming');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [streak, setStreak] = useState(0);

  // ---- new state for features ----
  // #1 - longest streak
  const [longestStreak, setLongestStreak] = useState(0);
  // #2 - rating flow
  const [pendingRating, setPendingRating] = useState<{ workoutId: string; rating: number; notes: string } | null>(null);
  // #5 - pagination
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 5;
  // #6 - reschedule
  const [rescheduling, setRescheduling] = useState<{ workoutId: string; newStart: string; newEnd: string } | null>(null);
  // #8 - live timer
  const [liveCountdown, setLiveCountdown] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerPulsing, setTimerPulsing] = useState(false);
  // #10 - exercise swap
  const [swapping, setSwapping] = useState<{ workoutId: string; exerciseIdx: number } | null>(null);
  const [swappedExercises, setSwappedExercises] = useState<Record<string, Exercise[]>>({});
  // #11 - calendars
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendar[]>([]);
  const [editTargetCalendarId, setEditTargetCalendarId] = useState<string>('');
  // #12 - history filter
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'skipped'>('all');
  // #13 - personal records
  const [personalRecords, setPersonalRecords] = useState<Record<string, PersonalRecord>>({});
  // #16 - badges
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);
  // #18 - mini calendar
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  // #22 - custom exercises
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [showCustomExerciseForm, setShowCustomExerciseForm] = useState(false);
  const [newExercise, setNewExercise] = useState<Partial<CustomExercise>>({});

  // ---- load data ----
  useEffect(() => {
    loadData();
  }, []);

  // #8 - live countdown timer for first upcoming workout
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const firstWorkout = upcomingWorkouts.find(w => {
      const skippedIds = new Set(workoutHistory.filter(h => h.skipped).map(h => h.id));
      return !skippedIds.has(w.id);
    });

    if (!firstWorkout) {
      setLiveCountdown('');
      return;
    }

    const updateTimer = () => {
      const diff = new Date(firstWorkout.startTime).getTime() - Date.now();
      if (diff > 0 && diff <= 60 * 60 * 1000) {
        const totalSecs = Math.floor(diff / 1000);
        const mm = Math.floor(totalSecs / 60);
        const ss = totalSecs % 60;
        setLiveCountdown(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
        setTimerPulsing(false);
      } else if (diff <= 0) {
        setLiveCountdown('00:00');
        setTimerPulsing(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setLiveCountdown('');
        setTimerPulsing(false);
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [upcomingWorkouts, workoutHistory]);

  // Reset history page when tab changes
  useEffect(() => {
    setHistoryPage(1);
  }, [activeTab]);

  // Load calendars when settings tab is opened for editing
  useEffect(() => {
    if (activeTab === 'settings' && isAuthenticated) {
      chrome.runtime.sendMessage({ type: 'GET_CALENDARS' })
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) {
            setAvailableCalendars(res.data);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, isAuthenticated]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      const storageData = await chrome.storage.local.get([
        'isOnboarded', 'lastCalendarScan', 'currentStreak', 'longestStreak',
        'unlockedBadges', 'personalRecords', 'customExercises',
      ]);
      const onboarded = storageData.isOnboarded || false;
      setIsOnboarded(onboarded);
      setLastCalendarScan(storageData.lastCalendarScan);
      const newStreak = storageData.currentStreak ?? 0;
      const milestones = [3, 7, 14, 30];
      if (milestones.includes(newStreak)) {
        showSuccess(`${newStreak} day streak! Keep it up!`);
      }
      setStreak(newStreak);
      setLongestStreak(storageData.longestStreak ?? 0);
      setUnlockedBadges(storageData.unlockedBadges ?? []);
      setPersonalRecords(storageData.personalRecords ?? {});
      setCustomExercises(storageData.customExercises ?? []);

      if (!onboarded) {
        setIsLoading(false);
        return;
      }

      const authResponse = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' });
      if (authResponse.success) {
        setIsAuthenticated(authResponse.data.isAuthenticated);
      }

      const workoutsResponse = await chrome.runtime.sendMessage({ type: 'GET_UPCOMING_WORKOUTS' });
      if (workoutsResponse.success) {
        setUpcomingWorkouts(workoutsResponse.data);
      } else {
        setErrorMessage('Failed to load upcoming workouts.');
      }

      const historyResponse = await chrome.runtime.sendMessage({ type: 'GET_WORKOUT_HISTORY' });
      if (historyResponse.success) {
        setWorkoutHistory(historyResponse.data);
      }

      const prefsResponse = await chrome.runtime.sendMessage({ type: 'GET_USER_PREFERENCES' });
      if (prefsResponse.success) {
        setPreferences(prefsResponse.data);
      }
    } catch (error: any) {
      setErrorMessage('Failed to connect to the extension. Please try reloading.');
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 2500);
  };

  // Derived
  const skippedIds = new Set(workoutHistory.filter(h => h.skipped).map(h => h.id));
  const visibleUpcoming = upcomingWorkouts.filter(w => !skippedIds.has(w.id));

  const completedThisWeek = workoutHistory.filter(w => {
    return w.completed && (Date.now() - new Date(w.date).getTime()) / 86400000 <= 7;
  }).length;

  const formatCountdown = (startTime: string) => {
    const diff = new Date(startTime).getTime() - Date.now();
    if (diff <= 0) return 'now';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 0) return `in ${h}h ${m}m`;
    return `in ${m}m`;
  };

  // #2 - mark complete: now shows rating UI instead
  const handleInitiateComplete = (workoutId: string) => {
    setPendingRating({ workoutId, rating: 0, notes: '' });
    setRescheduling(null);
  };

  const handleRateWorkout = async () => {
    if (!pendingRating) return;
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'RATE_WORKOUT',
        workoutId: pendingRating.workoutId,
        rating: pendingRating.rating,
        postNotes: pendingRating.notes,
      });
      setPendingRating(null);
      showSuccess('Workout marked as complete!');
      // #16 - check for newly unlocked badges
      if (response?.newlyUnlocked && Array.isArray(response.newlyUnlocked) && response.newlyUnlocked.length > 0) {
        const badgeNames = response.newlyUnlocked
          .map((id: string) => BADGE_DEFINITIONS.find(b => b.id === id)?.name)
          .filter(Boolean)
          .join(', ');
        showSuccess(`Badge unlocked: ${badgeNames}!`);
        setUnlockedBadges(prev => [...prev, ...response.newlyUnlocked]);
      }
      await loadData();
    } catch (error) {
      setErrorMessage('Failed to mark workout as complete. Please try again.');
      console.error('Error rating workout:', error);
    }
  };

  const handleSkip = async (workoutId: string) => {
    try {
      await chrome.runtime.sendMessage({ type: 'SKIP_WORKOUT', workoutId });
      await loadData();
    } catch {
      setErrorMessage('Failed to skip workout. Please try again.');
    }
  };

  const handleTriggerScan = async () => {
    if (isScanning) return;
    try {
      setIsScanning(true);
      setErrorMessage('');
      await chrome.runtime.sendMessage({ type: 'TRIGGER_CALENDAR_SCAN' });
      await loadData();
    } catch (error) {
      setErrorMessage('Calendar scan failed. Make sure you are connected to Google Calendar.');
      console.error('Error triggering scan:', error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await chrome.runtime.sendMessage({ type: 'REVOKE_TOKEN' });
      setIsAuthenticated(false);
      setConfirmDisconnect(false);
      showSuccess('Google Calendar disconnected.');
    } catch (error) {
      setErrorMessage('Failed to disconnect. Please try again.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    setErrorMessage('');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUTHENTICATE_GOOGLE' });
      if (response.success) {
        setIsAuthenticated(true);
      } else {
        setErrorMessage('Authentication failed. Please try again.');
      }
    } catch (error) {
      setErrorMessage('Could not connect to Google. Check your internet connection.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const prefsToSave = { ...editPreferences };
      if (editTargetCalendarId) {
        prefsToSave.targetCalendarId = editTargetCalendarId;
      }
      await chrome.runtime.sendMessage({
        type: 'SET_USER_PREFERENCES',
        preferences: prefsToSave as UserPreferences,
      });
      setPreferences(prefsToSave as UserPreferences);
      setIsEditingSettings(false);
      showSuccess('Preferences saved.');
    } catch (error) {
      setErrorMessage('Failed to save preferences. Please try again.');
      console.error('Error saving settings:', error);
    }
  };

  // #6 - reschedule
  const handleConfirmReschedule = async () => {
    if (!rescheduling) return;
    try {
      const start = new Date(rescheduling.newStart);
      const end = new Date(rescheduling.newEnd);
      const duration = Math.round((end.getTime() - start.getTime()) / 60000);
      await chrome.runtime.sendMessage({
        type: 'RESCHEDULE_WORKOUT',
        workoutId: rescheduling.workoutId,
        newStartTime: start.toISOString(),
        newEndTime: end.toISOString(),
        duration,
      });
      setRescheduling(null);
      showSuccess('Workout rescheduled.');
      await loadData();
    } catch {
      setErrorMessage('Failed to reschedule. Please try again.');
    }
  };

  // #15 - Export CSV
  const handleExportHistory = () => {
    const headers = 'date,type,duration,completed,skipped,rating,notes\n';
    const rows = workoutHistory.map(w => [
      w.date, w.type, w.duration, w.completed, w.skipped || false, w.rating || '', w.postNotes || '',
    ].join(','));
    const csv = headers + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fitmytime-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // #22 - Add custom exercise
  const handleAddCustomExercise = async () => {
    if (!newExercise.name || !newExercise.category) return;
    try {
      await chrome.runtime.sendMessage({
        type: 'ADD_CUSTOM_EXERCISE',
        exercise: newExercise,
      });
      setCustomExercises(prev => [...prev, newExercise as CustomExercise]);
      setNewExercise({});
      setShowCustomExerciseForm(false);
      showSuccess('Custom exercise added.');
    } catch {
      setErrorMessage('Failed to add exercise. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (startTime: string, endTime: string) => {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const duration = (end.getTime() - start.getTime()) / (1000 * 60);
    return `${Math.round(duration)} min`;
  };

  if (isLoading) {
    return (
      <div className="popup">
        <div className="loading">
          <div className="spinner" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return <OnboardingModal onComplete={loadData} />;
  }

  // ---- Weekly progress (feature #4) ----
  const weeklyGoal = preferences?.weeklyGoal;
  const weeklyProgress = weeklyGoal
    ? Math.min(completedThisWeek / weeklyGoal, 1)
    : 0;

  const renderEmptyState = () => {
    if (!isAuthenticated) {
      return (
        <div className="empty-state">
          <p>Connect Google Calendar to get started.</p>
          <button onClick={() => setActiveTab('settings')} className="btn-primary">
            Go to Settings
          </button>
        </div>
      );
    }
    if (!preferences) {
      return (
        <div className="empty-state">
          <p>Complete your setup to enable workout scheduling.</p>
          <button onClick={() => setActiveTab('settings')} className="btn-primary">
            Open Settings
          </button>
        </div>
      );
    }
    if (!lastCalendarScan) {
      return (
        <div className="empty-state">
          <p>Scan your calendar to find workout slots.</p>
          <button onClick={handleTriggerScan} className="btn-primary" disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </button>
        </div>
      );
    }
    return (
      <div className="empty-state">
        <p>No free time found in your preferred windows.</p>
        <p>Try adjusting your time windows in Settings or click Refresh.</p>
      </div>
    );
  };

  const renderUpcomingWorkouts = () => (
    <div className="tab-content">
      <div className="header">
        <h3>Upcoming Workouts</h3>
        <button
          onClick={handleTriggerScan}
          className="btn-secondary"
          disabled={isScanning}
        >
          {isScanning ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {lastCalendarScan && (
        <p className="last-scan">
          Last scanned {formatDistanceToNow(new Date(lastCalendarScan), { addSuffix: true })}
        </p>
      )}

      {visibleUpcoming.length === 0 ? renderEmptyState() : (
        <div className="workout-list">
          {visibleUpcoming.map((workout, idx) => {
            const isFirst = idx === 0;
            const showLiveTimer = isFirst && liveCountdown !== '';
            const cardToday = isToday(workout.startTime);
            const isPulse = isFirst && timerPulsing;
            const isPendingRating = pendingRating?.workoutId === workout.id;
            const isReschedulingThis = rescheduling?.workoutId === workout.id;
            const exercises = swappedExercises[workout.id] || ([] as Exercise[]);

            let cardClass = 'workout-card';
            if (cardToday) cardClass += ' today';
            if (isPulse) cardClass += ' pulse';

            return (
              <div key={workout.id} className={cardClass}>
                {/* #8 - Live timer */}
                {showLiveTimer && (
                  <div className="timer-display">
                    <div className="live-timer">{liveCountdown}</div>
                    <div className="live-timer-label">until workout</div>
                  </div>
                )}

                <div className="workout-header">
                  <h4>{workout.title}</h4>
                  <span className="duration">
                    {formatDuration(workout.startTime, workout.endTime)}
                  </span>
                </div>
                <div className="workout-details">
                  <p className="time">
                    {formatDate(workout.startTime)}
                    {isFirst && !showLiveTimer && (
                      <span className="countdown"> · {formatCountdown(workout.startTime)}</span>
                    )}
                  </p>
                  {workout.location && (
                    <p className="location">📍 {workout.location}</p>
                  )}
                </div>

                {/* Exercises with swap (feature #10) */}
                {workout.description && (
                  <details className="workout-description">
                    <summary>View exercises</summary>
                    {exercises.length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        {exercises.map((ex, exIdx) => {
                          const muscleGroup = ex.muscleGroup || 'general';
                          const alts = MUSCLE_ALTERNATIVES[muscleGroup] || MUSCLE_ALTERNATIVES['general'];
                          const isSwappingThis = swapping?.workoutId === workout.id && swapping.exerciseIdx === exIdx;
                          return (
                            <div key={exIdx} className="exercise-row">
                              <span className="exercise-name">
                                {ex.name} — {ex.sets}x{ex.reps}
                              </span>
                              <button
                                className="btn-swap"
                                onClick={() => setSwapping(isSwappingThis ? null : { workoutId: workout.id, exerciseIdx: exIdx })}
                              >
                                Swap
                              </button>
                              {isSwappingThis && (
                                <select
                                  className="swap-select"
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const newExs = [...exercises];
                                    newExs[exIdx] = { ...ex, name: e.target.value };
                                    setSwappedExercises(prev => ({ ...prev, [workout.id]: newExs }));
                                    setSwapping(null);
                                  }}
                                >
                                  <option value="">Pick alternative…</option>
                                  {alts.filter(a => a !== ex.name).map(a => (
                                    <option key={a} value={a}>{a}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <pre>{workout.description}</pre>
                    )}
                  </details>
                )}

                <div className="workout-actions">
                  <button
                    onClick={() => handleInitiateComplete(workout.id)}
                    className="btn-complete"
                    disabled={!!isPendingRating}
                  >
                    Mark Complete
                  </button>
                  <button onClick={() => handleSkip(workout.id)} className="btn-skip">
                    Skip
                  </button>
                  {/* #6 - Reschedule button */}
                  <button
                    className="btn-reschedule"
                    onClick={() => {
                      if (isReschedulingThis) {
                        setRescheduling(null);
                      } else {
                        setRescheduling({
                          workoutId: workout.id,
                          newStart: toLocalDatetimeValue(workout.startTime),
                          newEnd: toLocalDatetimeValue(workout.endTime),
                        });
                        setPendingRating(null);
                      }
                    }}
                  >
                    Reschedule
                  </button>
                </div>

                {/* #2 - Rating section */}
                {isPendingRating && (
                  <div className="rating-section">
                    <p>How was your workout?</p>
                    <div className="star-rating">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          className="star-btn"
                          onClick={() => setPendingRating(prev => prev ? { ...prev, rating: star } : null)}
                        >
                          {star <= (pendingRating?.rating || 0) ? '⭐' : '☆'}
                        </button>
                      ))}
                    </div>
                    {pendingRating.rating > 0 && (
                      <>
                        <textarea
                          className="rating-notes"
                          rows={2}
                          placeholder="Optional notes (e.g., felt strong today)…"
                          value={pendingRating.notes}
                          onChange={(e) => setPendingRating(prev => prev ? { ...prev, notes: e.target.value } : null)}
                        />
                        <div className="workout-actions">
                          <button className="btn-complete" onClick={handleRateWorkout}>
                            Done
                          </button>
                          <button className="btn-secondary" onClick={() => setPendingRating(null)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                    {pendingRating.rating === 0 && (
                      <button className="btn-secondary" onClick={() => setPendingRating(null)}>
                        Cancel
                      </button>
                    )}
                  </div>
                )}

                {/* #6 - Reschedule form */}
                {isReschedulingThis && rescheduling && (
                  <div className="reschedule-form">
                    <p>Reschedule this workout</p>
                    <div className="reschedule-inputs">
                      <div>
                        <label>New start time</label>
                        <input
                          type="datetime-local"
                          value={rescheduling.newStart}
                          onChange={(e) => setRescheduling(prev => prev ? { ...prev, newStart: e.target.value } : null)}
                        />
                      </div>
                      <div>
                        <label>New end time</label>
                        <input
                          type="datetime-local"
                          value={rescheduling.newEnd}
                          onChange={(e) => setRescheduling(prev => prev ? { ...prev, newEnd: e.target.value } : null)}
                        />
                      </div>
                    </div>
                    <div className="reschedule-actions">
                      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={handleConfirmReschedule}>
                        Confirm Reschedule
                      </button>
                      <button className="btn-secondary" onClick={() => setRescheduling(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // #1 - History stats with longest streak
  const renderHistoryStats = () => {
    const week = workoutHistory.filter(w => {
      const daysAgo = (Date.now() - new Date(w.date).getTime()) / 86400000;
      return daysAgo <= 7;
    });
    const completed = week.filter(w => w.completed).length;
    const totalMins = week.filter(w => w.completed).reduce((sum, w) => sum + w.duration, 0);
    const rate = week.length > 0 ? Math.round((completed / week.length) * 100) : 0;
    return (
      <div className="stats-card">
        <div className="stat">
          <span className="stat-value">{completed}</span>
          <span className="stat-label">Done this week</span>
        </div>
        <div className="stat">
          <span className="stat-value">{totalMins}m</span>
          <span className="stat-label">Time logged</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">Day streak</span>
        </div>
        <div className="stat">
          <span className="stat-value">{rate}%</span>
          <span className="stat-label">Completion</span>
        </div>
        <div className="stat">
          <span className="stat-value">{longestStreak}</span>
          <span className="stat-label">Best streak</span>
        </div>
      </div>
    );
  };

  // #17 - Progressive overload: count exercise appearances in last 5 completed workouts
  const getOverloadHints = (): Set<string> => {
    const lastFive = workoutHistory.filter(w => w.completed).slice(0, 5);
    const counts: Record<string, number> = {};
    lastFive.forEach(w => {
      w.exercises.forEach(ex => {
        counts[ex.name] = (counts[ex.name] || 0) + 1;
      });
    });
    return new Set(Object.entries(counts).filter(([, c]) => c >= 3).map(([name]) => name));
  };

  const renderWorkoutHistory = () => {
    // #12 - filter
    const filtered = workoutHistory.filter(w => {
      if (historyFilter === 'completed') return w.completed;
      if (historyFilter === 'skipped') return w.skipped;
      return true;
    });

    const totalPages = Math.ceil(filtered.length / HISTORY_PAGE_SIZE);
    const paginated = filtered.slice(0, historyPage * HISTORY_PAGE_SIZE);
    const overloadHints = getOverloadHints();

    return (
      <div className="tab-content">
        <h3>Recent Workouts</h3>
        {renderHistoryStats()}

        {/* #12 - filter buttons */}
        <div className="history-filter">
          {(['all', 'completed', 'skipped'] as const).map(f => (
            <button
              key={f}
              className={`filter-btn ${historyFilter === f ? 'active' : ''}`}
              onClick={() => { setHistoryFilter(f); setHistoryPage(1); }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>No workout history yet.</p>
          </div>
        ) : (
          <>
            <div className="history-list">
              {paginated.map(workout => {
                const hasPR = workout.exercises.some(
                  e => e.name in personalRecords && personalRecords[e.name].date === workout.date.split('T')[0]
                );
                const hasOverload = workout.exercises.some(e => overloadHints.has(e.name));
                return (
                  <div key={workout.id} className="history-item">
                    <div className="history-header">
                      <span className={`status ${workout.completed ? 'completed' : workout.skipped ? 'skipped' : 'pending'}`}>
                        {workout.completed ? '✅' : workout.skipped ? '⏭️' : '⏳'}
                      </span>
                      <span className="workout-type">
                        {workout.type.split('_').map(word =>
                          word.charAt(0).toUpperCase() + word.slice(1)
                        ).join(' ')}
                      </span>
                      {/* #13 - PR badge */}
                      {hasPR && <span className="pr-badge">🏆 PR</span>}
                      <span className="date">
                        {new Date(workout.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-details">
                      <span className="duration">{workout.duration} min</span>
                      <span className="exercises">
                        {workout.exercises.length} exercises
                      </span>
                      {workout.rating && <span>{'⭐'.repeat(workout.rating)}</span>}
                      {workout.postNotes && <span style={{ fontStyle: 'italic' }}>{workout.postNotes}</span>}
                    </div>
                    {/* #17 - Overload hint */}
                    {hasOverload && workout.completed && (
                      <div className="overload-hint">
                        Consider increasing weight on repeated exercises
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* #5 - Show more */}
            {historyPage < totalPages && (
              <button className="show-more-btn" onClick={() => setHistoryPage(p => p + 1)}>
                Show more
              </button>
            )}
          </>
        )}

        {/* #16 - Badges section */}
        <div className="badges-section">
          <h4>Badges</h4>
          <div className="badges-grid">
            {BADGE_DEFINITIONS.map(badge => {
              const isUnlocked = unlockedBadges.includes(badge.id);
              return (
                <div key={badge.id} className={`badge-item ${isUnlocked ? 'unlocked' : 'locked'}`} title={badge.description}>
                  {isUnlocked ? (
                    <>
                      <span className="badge-icon">{badge.icon}</span>
                      <span className="badge-name">{badge.name}</span>
                    </>
                  ) : (
                    <>
                      <span className="badge-locked-icon">🔒</span>
                      <span className="badge-name">{badge.name}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // #18 - Mini calendar tab
  const renderCalendarTab = () => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    // Build a map of date string → workout status
    const workoutByDate: Record<string, { status: 'completed' | 'skipped' | 'pending'; workout: WorkoutHistory | CalendarEvent }> = {};
    workoutHistory.forEach(w => {
      const key = w.date.split('T')[0];
      if (w.completed) workoutByDate[key] = { status: 'completed', workout: w };
      else if (w.skipped) workoutByDate[key] = { status: 'skipped', workout: w };
    });
    upcomingWorkouts.forEach(w => {
      const key = w.startTime.split('T')[0];
      if (!workoutByDate[key]) {
        workoutByDate[key] = { status: 'pending', workout: w };
      }
    });

    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const selectedDateStr = selectedCalendarDay !== null
      ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedCalendarDay).padStart(2, '0')}`
      : null;
    const selectedWorkout = selectedDateStr ? workoutByDate[selectedDateStr] : null;

    return (
      <div className="tab-content calendar-view">
        <div className="calendar-nav">
          <button onClick={() => {
            setCalendarMonth(prev => {
              const d = new Date(prev.year, prev.month - 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            });
            setSelectedCalendarDay(null);
          }}>‹</button>
          <h4>{monthName}</h4>
          <button onClick={() => {
            setCalendarMonth(prev => {
              const d = new Date(prev.year, prev.month + 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            });
            setSelectedCalendarDay(null);
          }}>›</button>
        </div>

        <div className="calendar-day-headers">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="calendar-day-header">{d}</div>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const entry = workoutByDate[dateStr];
            const isTodayMarker = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            let dayClass = 'calendar-day';
            if (isTodayMarker) dayClass += ' today-marker';
            if (entry) dayClass += ` has-workout ${entry.status}`;

            return (
              <div
                key={day}
                className={dayClass}
                onClick={() => setSelectedCalendarDay(selectedCalendarDay === day ? null : day)}
              >
                {day}
                {entry && <div className="calendar-day-dot" />}
              </div>
            );
          })}
        </div>

        {selectedWorkout && selectedDateStr && (
          <div className="calendar-detail-popup">
            <button className="calendar-detail-close" onClick={() => setSelectedCalendarDay(null)}>✕</button>
            <h5>{selectedDateStr}</h5>
            {'type' in selectedWorkout.workout ? (
              <>
                <p>Type: {(selectedWorkout.workout as WorkoutHistory).type.replace(/_/g, ' ')}</p>
                <p>Duration: {(selectedWorkout.workout as WorkoutHistory).duration} min</p>
                <p>Status: {selectedWorkout.status}</p>
              </>
            ) : (
              <>
                <p>{(selectedWorkout.workout as CalendarEvent).title}</p>
                <p>Status: Pending</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="tab-content">
      <h3>Settings</h3>

      {isEditingSettings ? (
        <>
          <PreferencesForm preferences={editPreferences} onChange={setEditPreferences} />

          {/* #11 - Target calendar picker */}
          {availableCalendars.length > 0 && (
            <div className="target-calendar-section">
              <label>Target Calendar (for new workouts)</label>
              <select
                value={editTargetCalendarId || editPreferences.targetCalendarId || ''}
                onChange={(e) => setEditTargetCalendarId(e.target.value)}
              >
                <option value="">Primary calendar</option>
                {availableCalendars.map(cal => (
                  <option key={cal.id} value={cal.id}>{cal.summary}</option>
                ))}
              </select>
            </div>
          )}

          <div className="settings-actions">
            <button onClick={handleSaveSettings} className="btn-primary">Save</button>
            <button onClick={() => setIsEditingSettings(false)} className="btn-secondary">Cancel</button>
          </div>
        </>
      ) : (
        <>
          {preferences ? (
            <div className="settings-list">
              <div className="setting-item">
                <label>Fitness Goal:</label>
                <span>{preferences.fitnessGoal.replace(/_/g, ' ')}</span>
              </div>

              <div className="setting-item">
                <label>Workout Days:</label>
                <span>{preferences.workoutDays.join(', ')}</span>
              </div>

              <div className="setting-item">
                <label>Duration Range:</label>
                <span>{preferences.minDuration}-{preferences.maxDuration} minutes</span>
              </div>

              <div className="setting-item">
                <label>Equipment:</label>
                <span>{preferences.equipment.length > 0 ? preferences.equipment.join(', ') : 'None'}</span>
              </div>

              {preferences.injuries.length > 0 && (
                <div className="setting-item">
                  <label>Injuries:</label>
                  <span>{preferences.injuries.join(', ')}</span>
                </div>
              )}

              {preferences.weeklyGoal && (
                <div className="setting-item">
                  <label>Weekly Goal:</label>
                  <span>{preferences.weeklyGoal} workouts/week</span>
                </div>
              )}

              {preferences.notifyLeadMinutes && (
                <div className="setting-item">
                  <label>Notifications:</label>
                  <span>{preferences.notifyLeadMinutes} min before</span>
                </div>
              )}

              <div className="setting-item">
                <label>Google Calendar:</label>
                {isAuthenticated ? (
                  <span className="auth-status connected">Connected</span>
                ) : (
                  <span className="auth-status disconnected">Not connected</span>
                )}
              </div>
            </div>
          ) : (
            <p>No preferences found. Please complete setup.</p>
          )}

          <div className="settings-actions">
            <button
              onClick={() => {
                setEditPreferences(preferences || {});
                setEditTargetCalendarId(preferences?.targetCalendarId || '');
                setIsEditingSettings(true);
              }}
              className="btn-primary"
            >
              Edit Preferences
            </button>
            <button
              onClick={handleTriggerScan}
              className="btn-secondary"
              disabled={isScanning}
            >
              {isScanning ? 'Scanning...' : 'Manually Scan Calendar'}
            </button>
            {/* #15 - Export CSV */}
            {workoutHistory.length > 0 && (
              <button onClick={handleExportHistory} className="btn-export">
                Export History CSV
              </button>
            )}
            {isAuthenticated ? (
              confirmDisconnect ? (
                <div className="disconnect-confirm">
                  <span>Disconnect Google Calendar?</span>
                  <button onClick={handleDisconnect} className="btn-danger" disabled={isDisconnecting}>
                    {isDisconnecting ? 'Disconnecting...' : 'Yes, Disconnect'}
                  </button>
                  <button onClick={() => setConfirmDisconnect(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDisconnect(true)} className="btn-danger">
                  Disconnect Google
                </button>
              )
            ) : (
              <button onClick={handleConnect} className="btn-primary" disabled={isConnecting}>
                {isConnecting ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
            )}
          </div>

          {/* #22 - Custom exercises section */}
          <div className="custom-exercises-section">
            <h4>Custom Exercises</h4>
            {customExercises.length > 0 && (
              <div className="custom-exercise-list">
                {customExercises.map((ex, i) => (
                  <div key={i} className="custom-exercise-item">
                    <span>{ex.name}</span>
                    <span style={{ color: '#6c757d', fontSize: 11 }}>{ex.category.replace(/_/g, ' ')} · {ex.sets}×{ex.reps}</span>
                  </div>
                ))}
              </div>
            )}
            {customExercises.length === 0 && !showCustomExerciseForm && (
              <p style={{ fontSize: 13, color: '#6c757d', margin: '4px 0 8px' }}>No custom exercises yet.</p>
            )}
            {!showCustomExerciseForm ? (
              <button className="btn-secondary" onClick={() => setShowCustomExerciseForm(true)}>
                + Add Exercise
              </button>
            ) : (
              <div className="custom-exercise-form">
                <input
                  type="text"
                  placeholder="Exercise name"
                  value={newExercise.name || ''}
                  onChange={(e) => setNewExercise(prev => ({ ...prev, name: e.target.value }))}
                />
                <select
                  value={newExercise.category || ''}
                  onChange={(e) => setNewExercise(prev => ({ ...prev, category: e.target.value as any }))}
                >
                  <option value="">Select category…</option>
                  <option value="upper_body_strength">Upper Body Strength</option>
                  <option value="lower_body_strength">Lower Body Strength</option>
                  <option value="cardio">Cardio</option>
                  <option value="hiit">HIIT</option>
                  <option value="flexibility">Flexibility</option>
                  <option value="full_body">Full Body</option>
                  <option value="core">Core</option>
                </select>
                <input
                  type="text"
                  placeholder="Muscle group (optional)"
                  value={newExercise.muscleGroup || ''}
                  onChange={(e) => setNewExercise(prev => ({ ...prev, muscleGroup: e.target.value }))}
                />
                <div className="custom-exercise-row">
                  <label>Sets</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newExercise.sets || ''}
                    onChange={(e) => setNewExercise(prev => ({ ...prev, sets: parseInt(e.target.value) }))}
                  />
                  <label>Reps</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newExercise.reps || ''}
                    onChange={(e) => setNewExercise(prev => ({ ...prev, reps: parseInt(e.target.value) }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    onClick={handleAddCustomExercise}
                    disabled={!newExercise.name || !newExercise.category}
                  >
                    Add Exercise
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowCustomExerciseForm(false); setNewExercise({}); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="popup">
      <div className="popup-header">
        <h2>FitMyTime</h2>
        <div className="header-meta">
          <p>Smart workout scheduling</p>
          {streak > 0 && (
            <span className="streak-badge">{streak} day streak</span>
          )}
        </div>
      </div>

      {/* #4 - Weekly progress bar */}
      {weeklyGoal && (
        <div className="weekly-progress">
          <div className="weekly-progress-label">
            {completedThisWeek} of {weeklyGoal} this week
          </div>
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${Math.round(weeklyProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="error-banner">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage('')} className="error-dismiss">✕</button>
        </div>
      )}

      {successMessage && (
        <div className="success-banner">
          <span>{successMessage}</span>
        </div>
      )}

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'upcoming' ? 'active' : ''}`}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming
          {upcomingWorkouts.length > 0 && (
            <span className="tab-badge">{upcomingWorkouts.length}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
          {completedThisWeek > 0 && (
            <span className="tab-badge">{completedThisWeek}</span>
          )}
        </button>
        <button
          className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      {activeTab === 'upcoming' && renderUpcomingWorkouts()}
      {activeTab === 'history' && renderWorkoutHistory()}
      {activeTab === 'calendar' && renderCalendarTab()}
      {activeTab === 'settings' && renderSettings()}
    </div>
  );
};
