import { GoogleAuthService } from './googleAuth';
import { GoogleCalendarEvent, FreeTimeSlot, CalendarEvent, GoogleCalendar } from '../types';
import { format, addDays, parseISO, startOfDay } from 'date-fns';

export class CalendarService {
  private static instance: CalendarService;
  private authService: GoogleAuthService;

  private constructor() {
    this.authService = GoogleAuthService.getInstance();
  }

  static getInstance(): CalendarService {
    if (!CalendarService.instance) {
      CalendarService.instance = new CalendarService();
    }
    return CalendarService.instance;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.authService.authenticate();

    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Remove stale cached token and re-authenticate
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, () => resolve());
      });

      const freshToken = await this.authService.authenticate();

      const retryHeaders = {
        ...options.headers,
        'Authorization': `Bearer ${freshToken}`,
        'Content-Type': 'application/json'
      };

      const retryResponse = await fetch(url, { ...options, headers: retryHeaders });

      if (!retryResponse.ok) {
        throw new Error(`Request failed after token refresh: ${retryResponse.statusText}`);
      }

      return retryResponse;
    }

    return response;
  }

  async getEvents(
    startDate: Date,
    endDate: Date,
    calendarId: string = 'primary'
  ): Promise<GoogleCalendarEvent[]> {
    const startTime = startDate.toISOString();
    const endTime = endDate.toISOString();

    const encodedId = encodeURIComponent(calendarId);
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events?` +
      `timeMin=${startTime}&timeMax=${endTime}&singleEvents=true&orderBy=startTime`;

    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  async addWorkoutEvent(
    title: string,
    description: string,
    startTime: Date,
    endTime: Date,
    location?: string,
    calendarId: string = 'primary',
    leadMinutes: number = 15
  ): Promise<string> {
    const event = {
      summary: title,
      description: description,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      location: location,
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: leadMinutes }]
      }
    };

    const encodedId = encodeURIComponent(calendarId);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events`;

    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      throw new Error(`Failed to add calendar event: ${response.statusText}`);
    }

    const result = await response.json();
    return result.id;
  }

  async deleteEvent(eventId: string, calendarId: string = 'primary'): Promise<void> {
    const encodedId = encodeURIComponent(calendarId);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodedId}/events/${eventId}`;

    const response = await this.fetchWithAuth(url, { method: 'DELETE' });

    if (!response.ok) {
      throw new Error(`Failed to delete calendar event: ${response.statusText}`);
    }
  }

  async getUserCalendars(): Promise<GoogleCalendar[]> {
    const url = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';

    const response = await this.fetchWithAuth(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch calendar list: ${response.statusText}`);
    }

    const data = await response.json();
    return data.items || [];
  }

  async findFreeTimeSlots(
    startDate: Date,
    endDate: Date,
    minDuration: number,
    preferredDays: string[],
    preferredTimes: { start: string; end: string }[]
  ): Promise<FreeTimeSlot[]> {
    const events = await this.getEvents(startDate, endDate);
    const freeSlots: FreeTimeSlot[] = [];

    const allSlots = this.generateTimeSlots(startDate, endDate, preferredDays, preferredTimes);

    for (const slot of allSlots) {
      if (slot.duration >= minDuration && !this.hasConflict(slot, events)) {
        freeSlots.push(slot);
      }
    }

    return freeSlots;
  }

  private generateTimeSlots(
    startDate: Date,
    endDate: Date,
    preferredDays: string[],
    preferredTimes: { start: string; end: string }[]
  ): FreeTimeSlot[] {
    const slots: FreeTimeSlot[] = [];
    let currentDate = startOfDay(startDate);

    while (currentDate <= endDate) {
      const dayName = format(currentDate, 'EEEE').toLowerCase();

      if (preferredDays.includes(dayName)) {
        for (const timeWindow of preferredTimes) {
          const [startHour, startMinute] = timeWindow.start.split(':').map(Number);
          const [endHour, endMinute] = timeWindow.end.split(':').map(Number);

          const slotStart = new Date(currentDate);
          slotStart.setHours(startHour, startMinute, 0, 0);

          const slotEnd = new Date(currentDate);
          slotEnd.setHours(endHour, endMinute, 0, 0);

          const duration = (slotEnd.getTime() - slotStart.getTime()) / (1000 * 60); // minutes

          slots.push({
            startTime: slotStart.toISOString(),
            endTime: slotEnd.toISOString(),
            duration
          });
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    return slots;
  }

  private getEventDateTime(eventTime: { dateTime?: string; date?: string }): Date {
    return parseISO(eventTime.dateTime ?? eventTime.date!);
  }

  private hasConflict(slot: FreeTimeSlot, events: GoogleCalendarEvent[]): boolean {
    const slotStart = parseISO(slot.startTime);
    const slotEnd = parseISO(slot.endTime);

    return events.some(event => {
      // Skip all-day events — they have no dateTime
      if (!event.start.dateTime && !event.end.dateTime) return false;

      const eventStart = this.getEventDateTime(event.start);
      const eventEnd = this.getEventDateTime(event.end);

      return (
        (slotStart < eventEnd && slotEnd > eventStart) ||
        (eventStart < slotEnd && eventEnd > slotStart)
      );
    });
  }

  async getUpcomingWorkouts(
    limit: number = 5,
    calendarId: string = 'primary'
  ): Promise<CalendarEvent[]> {
    const now = new Date();
    const endDate = addDays(now, 7);

    const events = await this.getEvents(now, endDate, calendarId);

    return events
      .filter(event => event.summary.toLowerCase().includes('workout') && !!event.start.dateTime)
      .slice(0, limit)
      .map(event => ({
        id: event.id,
        title: event.summary,
        description: event.description || '',
        startTime: event.start.dateTime!,
        endTime: event.end.dateTime!,
        location: event.location
      }));
  }
}
