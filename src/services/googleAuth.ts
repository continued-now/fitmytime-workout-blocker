import { StorageManager } from '../utils/storage';

export class GoogleAuthService {
  private static instance: GoogleAuthService;
  private storageManager: StorageManager;
  
  private constructor() {
    this.storageManager = StorageManager.getInstance();
  }
  
  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  async authenticate(): Promise<string> {
    try {
      const token = await this.getStoredToken();
      if (token) {
        return token;
      }

      return await this.requestNewToken();
    } catch (error) {
      console.error('Authentication failed:', error);
      throw new Error('Failed to authenticate with Google');
    }
  }

  private async getStoredToken(): Promise<string | null> {
    const token = await this.storageManager.getGoogleToken();
    if (token) {
      // Verify token is still valid
      const isValid = await this.verifyToken(token);
      if (isValid) {
        return token;
      } else {
        await this.storageManager.clearGoogleToken();
      }
    }
    return null;
  }

  private async requestNewToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        if (token) {
          this.storageManager.setGoogleToken(token);
          resolve(token);
        } else {
          reject(new Error('Failed to get auth token'));
        }
      });
    });
  }

  private async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${token}`
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async revokeToken(): Promise<void> {
    const token = await this.storageManager.getGoogleToken();
    if (token) {
      try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
      } catch (error) {
        console.error('Failed to revoke token:', error);
      }
      await this.storageManager.clearGoogleToken();
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await this.getStoredToken();
      return !!token;
    } catch (error) {
      return false;
    }
  }
} 