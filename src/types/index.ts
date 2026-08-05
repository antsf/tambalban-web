export type Workshop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  address: string | null;
  open_time: string | null;
  close_time: string | null;
  is_24h: boolean;
  rating_avg: number;
  rating_count: number;
  source: string | null;
  created_at: string;
};

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type WorkshopSubmission = {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude: number;
  longitude: number;
  open_time: string | null;
  close_time: string | null;
  is_24h: boolean;
  notes: string | null;
  status: SubmissionStatus;
  created_at: string;
  reviewed_at: string | null;
  approved_workshop_id: string | null;
};

export type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};
