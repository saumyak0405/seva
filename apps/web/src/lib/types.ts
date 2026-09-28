export type Role = 'HOUSEHOLD' | 'ADMIN';
export type Service = 'CLEANING' | 'COOKING' | 'BABYSITTING' | 'ELDER_CARE' | 'LAUNDRY' | 'GARDENING';
export type BookingStatus = 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'REJECTED';
export type BookingType = 'ONE_TIME' | 'MONTHLY';
export type IdType = 'AADHAAR' | 'VOTER_ID' | 'PAN' | 'DRIVING_LICENCE';

export interface User {
  id: string;
  phone: string;
  name: string | null;
  role: Role;
  address: string | null;
  locality: string | null;
}

export interface Worker {
  id: string;
  name: string;
  services: Service[];
  locality: string;
  city: string;
  languages: string[];
  experienceYears: number;
  hourlyRate: number;
  monthlyRate: number | null;
  bio: string | null;
  verified: boolean;
}

export interface AdminWorker extends Worker {
  phone: string;
  active: boolean;
  verifiedAt: string | null;
  idType: IdType | null;
  idLast4: string | null;
  hasIdOnFile: boolean;
  createdAt: string;
}

export type Schedule =
  | { date: string; startTime: string; endTime: string }
  | { startDate: string; startTime: string; endTime: string };

export interface Booking {
  id: string;
  type: BookingType;
  service: Service;
  status: BookingStatus;
  workerId: string;
  householdId: string;
  schedule: Schedule;
  address: string;
  notes: string | null;
  priceRupees: number;
  feeRupees: number;
  createdAt: string;
  updatedAt: string;
}

export interface BookingWithWorker extends Booking {
  worker: Worker;
}

export interface BookingDetail extends BookingWithWorker {
  events: { fromStatus: BookingStatus | null; toStatus: BookingStatus; note: string | null; at: string }[];
}

export interface AdminBooking extends Booking {
  worker: { id: string; name: string; phone: string };
  household: { id: string; name: string | null; phone: string };
}

export interface BusyWindow {
  start: string;
  end: string;
  recurring: boolean;
}
