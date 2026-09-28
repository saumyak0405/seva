/**
 * Notification channel abstraction. v1 logs to the console; swap in a
 * WhatsApp/SMS provider (e.g. Gupshup, MSG91, Twilio) by implementing Notifier.
 */
export interface Notifier {
  sendOtp(phone: string, code: string): Promise<void>;
  send(phone: string, message: string): Promise<void>;
}

class ConsoleNotifier implements Notifier {
  async sendOtp(phone: string, code: string) {
    if (process.env.NODE_ENV !== 'test') console.info(`[otp] ${maskPhone(phone)} -> ${code}`);
  }
  async send(phone: string, message: string) {
    if (process.env.NODE_ENV !== 'test') console.info(`[notify] ${maskPhone(phone)}: ${message}`);
  }
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}

export const notifier: Notifier = new ConsoleNotifier();
