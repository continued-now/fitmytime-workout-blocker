import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingModal } from './components/OnboardingModal';

class ContentScript {
  private modalContainer: HTMLDivElement | null = null;

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SHOW_ONBOARDING_MODAL') {
        this.showOnboardingModal();
      }
    });
  }

  private showOnboardingModal() {
    // Create modal container if it doesn't exist
    if (!this.modalContainer) {
      this.modalContainer = document.createElement('div');
      this.modalContainer.id = 'fitmytime-modal-container';
      this.modalContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      document.body.appendChild(this.modalContainer);
    }

    // Create React root and render modal
    const root = createRoot(this.modalContainer);
    root.render(
      <OnboardingModal onComplete={() => this.hideOnboardingModal()} />
    );
  }

  private hideOnboardingModal() {
    if (this.modalContainer) {
      this.modalContainer.remove();
      this.modalContainer = null;
    }
  }
}

// Initialize content script
new ContentScript(); 