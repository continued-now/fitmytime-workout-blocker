import React, { useState, useEffect } from 'react';
import { UserPreferences } from '../types';
import { PreferencesForm } from './PreferencesForm';

interface OnboardingModalProps {
  onComplete: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [preferences, setPreferences] = useState<Partial<UserPreferences>>({
    fitnessGoal: 'general_fitness',
    workoutDays: ['monday', 'wednesday', 'friday'],
    timeWindows: [
      { day: 'monday', startTime: '07:00', endTime: '09:00' },
      { day: 'wednesday', startTime: '07:00', endTime: '09:00' },
      { day: 'friday', startTime: '07:00', endTime: '09:00' }
    ],
    minDuration: 30,
    maxDuration: 60,
    restrictions: [],
    equipment: [],
    injuries: [],
    dislikedExercises: []
  });

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH_STATUS' });
      if (response.success) {
        setIsAuthenticated(response.data.isAuthenticated);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    }
  };

  const handleGoogleAuth = async () => {
    setIsAuthenticating(true);
    setErrorMessage('');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'AUTHENTICATE_GOOGLE' });
      if (response.success) {
        setIsAuthenticated(true);
        setStep(2);
      } else {
        setErrorMessage('Authentication failed. Please try again.');
      }
    } catch (error) {
      setErrorMessage('Could not connect to Google. Check your internet connection and try again.');
      console.error('Authentication failed:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSavePreferences = async () => {
    setErrorMessage('');
    try {
      await chrome.runtime.sendMessage({
        type: 'SET_USER_PREFERENCES',
        preferences: preferences as UserPreferences
      });

      await chrome.runtime.sendMessage({ type: 'SET_ONBOARDED' });

      onComplete();
    } catch (error) {
      setErrorMessage('Failed to save preferences. Please try again.');
      console.error('Error saving preferences:', error);
    }
  };

  const renderStep1 = () => (
    <div className="step">
      <h2>Welcome to FitMyTime!</h2>
      <p>Let's get you set up with smart workout scheduling.</p>

      <div className="auth-section">
        <h3>Step 1: Connect Google Calendar</h3>
        <p>We'll scan your calendar to find the best times for your workouts.</p>

        {errorMessage && <div className="error-message">{errorMessage}</div>}

        {isAuthenticated ? (
          <div className="success-message">
            Connected to Google Calendar
            <button onClick={() => setStep(2)} className="btn-primary">
              Continue
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleAuth}
            disabled={isAuthenticating}
            className="btn-primary"
          >
            {isAuthenticating ? 'Connecting...' : 'Connect Google Calendar'}
          </button>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="step">
      <h2>Fitness Goals & Preferences</h2>

      {errorMessage && <div className="error-message">{errorMessage}</div>}

      <PreferencesForm preferences={preferences} onChange={setPreferences} />

      <div className="button-group">
        <button onClick={() => setStep(1)} className="btn-secondary">
          Back
        </button>
        <button onClick={handleSavePreferences} className="btn-primary">
          Complete Setup
        </button>
      </div>
    </div>
  );

  return (
    <div className="onboarding-modal">
      <div className="modal-content">
        {step === 1 ? renderStep1() : renderStep2()}
      </div>
    </div>
  );
};
