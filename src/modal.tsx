import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingModal } from './components/OnboardingModal';
import './styles/modal.css';

const container = document.getElementById('modal-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <OnboardingModal 
      onComplete={() => {
        console.log('Onboarding completed');
        // Close modal or redirect
      }} 
    />
  );
} 