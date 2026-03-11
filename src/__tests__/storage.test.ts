import { StorageManager } from '../utils/storage';
import { UserPreferences } from '../types';

describe('StorageManager', () => {
  let storageManager: StorageManager;

  beforeEach(() => {
    storageManager = StorageManager.getInstance();
    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('getData', () => {
    it('should return default data when storage is empty', async () => {
      (chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        callback({});
      });

      const data = await storageManager.getData();
      
      expect(data).toEqual({
        workoutHistory: [],
        isOnboarded: false
      });
    });

    it('should return stored data', async () => {
      const mockData = {
        userPreferences: { fitnessGoal: 'weight_loss' },
        workoutHistory: [],
        isOnboarded: true
      };

      (chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        callback(mockData);
      });

      const data = await storageManager.getData();
      
      expect(data).toEqual(mockData);
    });
  });

  describe('setData', () => {
    it('should store data', async () => {
      const testData = { isOnboarded: true };
      
      (chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        callback();
      });

      await storageManager.setData(testData);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ isOnboarded: true }, expect.any(Function));
    });
  });

  describe('getUserPreferences', () => {
    it('should return user preferences', async () => {
      const mockPreferences: UserPreferences = {
        fitnessGoal: 'weight_loss',
        workoutDays: ['monday', 'wednesday'],
        timeWindows: [],
        minDuration: 30,
        maxDuration: 60,
        restrictions: [],
        equipment: [],
        injuries: [],
        dislikedExercises: []
      };

      (chrome.storage.local.get as jest.Mock).mockImplementation((keys, callback) => {
        callback({ userPreferences: mockPreferences });
      });

      const preferences = await storageManager.getUserPreferences();
      
      expect(preferences).toEqual(mockPreferences);
    });
  });

  describe('setUserPreferences', () => {
    it('should store user preferences', async () => {
      const preferences: UserPreferences = {
        fitnessGoal: 'muscle_gain',
        workoutDays: ['tuesday', 'thursday'],
        timeWindows: [],
        minDuration: 45,
        maxDuration: 90,
        restrictions: [],
        equipment: ['dumbbells'],
        injuries: [],
        dislikedExercises: []
      };

      (chrome.storage.local.set as jest.Mock).mockImplementation((data, callback) => {
        callback();
      });

      await storageManager.setUserPreferences(preferences);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        { userPreferences: preferences },
        expect.any(Function)
      );
    });
  });
}); 