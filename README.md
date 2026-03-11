# FitMyTime Chrome Extension

A smart workout scheduling Chrome extension that integrates with Google Calendar to automatically find free time slots and suggest personalized workouts based on your fitness goals and preferences.

## Features

### 🎯 Smart Workout Scheduling
- **Daily Calendar Scanning**: Automatically scans your Google Calendar every 24 hours
- **Free Time Detection**: Finds available time slots that match your workout preferences
- **Conflict Avoidance**: Ensures workouts don't conflict with existing calendar events

### 🏋️ Personalized Workout Suggestions
- **Goal-Based Routines**: Tailored workouts for weight loss, muscle gain, general fitness, flexibility, or custom goals
- **Equipment-Aware**: Suggests exercises based on available equipment
- **Injury-Safe**: Respects your physical restrictions and injuries
- **Variety Logic**: Avoids repeating muscle groups and alternates intensity levels

### 📅 Google Calendar Integration
- **OAuth Authentication**: Secure connection to your Google Calendar
- **Automatic Event Creation**: Adds suggested workouts as calendar events
- **Smart Reminders**: 15-minute notifications before each workout
- **Completion Tracking**: Mark workouts as complete directly from the extension

### 🎨 Modern User Interface
- **Onboarding Flow**: Step-by-step setup with Google Calendar connection
- **Tabbed Interface**: Easy navigation between upcoming workouts, history, and settings
- **Responsive Design**: Works seamlessly across different screen sizes

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Google Cloud Console project with Calendar API enabled

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fitmytime_workout-blocker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable Google Calendar API
   - Create OAuth 2.0 credentials
   - Update `manifest.json` with your client ID:
     ```json
     "oauth2": {
       "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com"
     }
     ```

4. **Build the extension**
   ```bash
   npm run build
   ```

5. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Development

### Available Scripts
- `npm run dev` - Development build with watch mode
- `npm run build` - Production build
- `npm test` - Run tests

### Project Structure
```
src/
├── components/          # React components
│   ├── OnboardingModal.tsx
│   └── Popup.tsx
├── services/           # Business logic services
│   ├── calendarService.ts
│   ├── googleAuth.ts
│   └── workoutEngine.ts
├── styles/            # CSS styles
│   ├── modal.css
│   └── popup.css
├── types/             # TypeScript type definitions
│   └── index.ts
├── utils/             # Utility functions
│   └── storage.ts
├── background.ts      # Service worker
├── content.ts         # Content script
├── modal.tsx          # Modal entry point
└── popup.tsx          # Popup entry point
```

## Configuration

### User Preferences
The extension stores user preferences including:
- Fitness goals (weight loss, muscle gain, etc.)
- Preferred workout days and time windows
- Minimum/maximum workout duration
- Available equipment
- Injuries and restrictions
- Disliked exercises

### Workout Engine
The workout suggestion engine uses:
- **Rules-based logic** for exercise selection
- **History tracking** to avoid muscle group repetition
- **Goal-specific adjustments** for sets, reps, and intensity
- **Equipment filtering** to match available resources

## API Integration

### Google Calendar API
- **Scopes**: Calendar read/write, Fitness data
- **Endpoints**: Events, free time detection, event creation
- **Authentication**: OAuth 2.0 with token refresh

### Future Enhancements
- **Google Fit Integration**: Track workout completion and metrics
- **Apple Health Integration**: Sync with iOS health data
- **External Workout APIs**: Integration with Wger, ExRx, or similar services

## Modular Architecture

### Workout Engine Modularity
The workout engine is designed for easy upgrades:

```typescript
// Current: Rules-based engine
class WorkoutEngine {
  async suggestWorkout(preferences): Promise<WorkoutSuggestion>
}

// Future: AI-powered engine
class AIWorkoutEngine extends WorkoutEngine {
  async suggestWorkout(preferences): Promise<WorkoutSuggestion> {
    // AI-powered suggestions
    return await this.aiService.generateWorkout(preferences);
  }
}
```

### Plugin System
The architecture supports plugins for:
- **Exercise Libraries**: Different workout databases
- **Scheduling Algorithms**: Various time slot selection strategies
- **Notification Systems**: Different reminder mechanisms

## Security & Privacy

- **Local Storage**: User preferences stored locally in Chrome storage
- **OAuth 2.0**: Secure Google Calendar access
- **Minimal Permissions**: Only requests necessary calendar and notification permissions
- **No Data Collection**: No personal data sent to external servers

## Troubleshooting

### Common Issues

1. **OAuth Authentication Fails**
   - Verify client ID in manifest.json
   - Check Google Cloud Console API settings
   - Ensure Calendar API is enabled

2. **Calendar Events Not Found**
   - Verify calendar permissions
   - Check time zone settings
   - Ensure events are marked as "busy"

3. **Workouts Not Scheduled**
   - Check user preferences are set
   - Verify time windows don't conflict
   - Review browser console for errors

### Debug Mode
Enable debug logging by setting `debug: true` in the background service.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the Chrome extension documentation

---

**FitMyTime** - Making fitness fit your schedule! 🏃‍♂️💪 