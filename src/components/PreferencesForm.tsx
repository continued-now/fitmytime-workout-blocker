import React from 'react';
import { UserPreferences, FitnessGoal, TimeWindow } from '../types';

interface PreferencesFormProps {
  preferences: Partial<UserPreferences>;
  onChange: (preferences: Partial<UserPreferences>) => void;
}

export const PreferencesForm: React.FC<PreferencesFormProps> = ({ preferences, onChange }) => {
  const update = (key: keyof UserPreferences, value: any) => {
    onChange({ ...preferences, [key]: value });
  };

  const addTimeWindow = () => {
    const newWindow: TimeWindow = { day: 'monday', startTime: '07:00', endTime: '09:00' };
    update('timeWindows', [...(preferences.timeWindows || []), newWindow]);
  };

  const removeTimeWindow = (index: number) => {
    update('timeWindows', preferences.timeWindows?.filter((_, i) => i !== index));
  };

  const updateTimeWindow = (index: number, field: keyof TimeWindow, value: string) => {
    update('timeWindows', preferences.timeWindows?.map((w, i) =>
      i === index ? { ...w, [field]: value } : w
    ));
  };

  return (
    <>
      <div className="form-group">
        <label>What's your primary fitness goal?</label>
        <select
          value={preferences.fitnessGoal}
          onChange={(e) => update('fitnessGoal', e.target.value as FitnessGoal)}
        >
          <option value="weight_loss">Weight Loss</option>
          <option value="muscle_gain">Muscle Gain</option>
          <option value="general_fitness">General Fitness</option>
          <option value="flexibility">Flexibility</option>
          <option value="custom">Custom Goal</option>
        </select>
      </div>

      <div className="form-group">
        <label>Preferred workout days:</label>
        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
          <label key={day} className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.workoutDays?.includes(day)}
              onChange={(e) => {
                const current = preferences.workoutDays || [];
                update('workoutDays', e.target.checked
                  ? [...current, day]
                  : current.filter(d => d !== day));
              }}
            />
            {day.charAt(0).toUpperCase() + day.slice(1)}
          </label>
        ))}
      </div>

      <div className="form-group">
        <label>Available time windows:</label>
        {preferences.timeWindows?.map((window, index) => (
          <div key={index} className="time-window">
            <select
              value={window.day}
              onChange={(e) => updateTimeWindow(index, 'day', e.target.value)}
            >
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                <option key={day} value={day}>
                  {day.charAt(0).toUpperCase() + day.slice(1)}
                </option>
              ))}
            </select>
            <input
              type="time"
              value={window.startTime}
              onChange={(e) => updateTimeWindow(index, 'startTime', e.target.value)}
            />
            <span>to</span>
            <input
              type="time"
              value={window.endTime}
              onChange={(e) => updateTimeWindow(index, 'endTime', e.target.value)}
            />
            <button onClick={() => removeTimeWindow(index)} className="btn-remove">
              Remove
            </button>
            {window.startTime >= window.endTime && (
              <span className="time-window-error">Start must be before end</span>
            )}
          </div>
        ))}
        <button onClick={addTimeWindow} className="btn-secondary">
          Add Time Window
        </button>
      </div>

      <div className="form-group">
        <label>Workout duration (minutes):</label>
        <div className="duration-inputs">
          <input
            type="number"
            min="15"
            max="120"
            value={preferences.minDuration}
            onChange={(e) => update('minDuration', parseInt(e.target.value))}
            placeholder="Min duration"
          />
          <span>to</span>
          <input
            type="number"
            min="15"
            max="120"
            value={preferences.maxDuration}
            onChange={(e) => update('maxDuration', parseInt(e.target.value))}
            placeholder="Max duration"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Equipment available:</label>
        {['none', 'dumbbells', 'barbell', 'pull-up bar', 'bike', 'jump rope'].map(equipment => (
          <label key={equipment} className="checkbox-label">
            <input
              type="checkbox"
              checked={preferences.equipment?.includes(equipment)}
              onChange={(e) => {
                const current = preferences.equipment || [];
                if (e.target.checked) {
                  if (equipment === 'none') {
                    update('equipment', ['none']);
                  } else {
                    update('equipment', [...current.filter(eq => eq !== 'none'), equipment]);
                  }
                } else {
                  update('equipment', current.filter(eq => eq !== equipment));
                }
              }}
            />
            {equipment.charAt(0).toUpperCase() + equipment.slice(1)}
          </label>
        ))}
      </div>

      <div className="form-group">
        <label>Any injuries or restrictions?</label>
        <input
          type="text"
          placeholder="e.g., bad knee, back pain"
          value={preferences.injuries?.join(', ')}
          onChange={(e) => update('injuries', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>

      <div className="form-group">
        <label>Exercises you dislike:</label>
        <input
          type="text"
          placeholder="e.g., burpees, running"
          value={preferences.dislikedExercises?.join(', ')}
          onChange={(e) => update('dislikedExercises', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
        />
      </div>

      {/* Feature #4 - Weekly Goal */}
      <div className="form-group">
        <label>Weekly workout goal:</label>
        <input
          type="number"
          min="1"
          max="7"
          value={preferences.weeklyGoal ?? ''}
          placeholder="e.g., 4"
          onChange={(e) => {
            const val = parseInt(e.target.value);
            update('weeklyGoal', isNaN(val) ? undefined : Math.min(7, Math.max(1, val)));
          }}
        />
        <small style={{ color: '#6c757d', fontSize: '11px', marginTop: '4px', display: 'block' }}>
          How many workouts per week do you want to complete? (1–7)
        </small>
      </div>

      {/* Feature #3 - Notification lead time */}
      <div className="form-group">
        <label>Notify me before workout:</label>
        <select
          value={preferences.notifyLeadMinutes ?? ''}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            update('notifyLeadMinutes', isNaN(val) ? undefined : val);
          }}
        >
          <option value="">No notification</option>
          <option value="5">5 minutes before</option>
          <option value="10">10 minutes before</option>
          <option value="15">15 minutes before</option>
          <option value="30">30 minutes before</option>
        </select>
      </div>
    </>
  );
};
