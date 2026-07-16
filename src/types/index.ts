// ============================================================
// Nand Dairy — Shared TypeScript Types
// Matches the full data model from Nand_Dairy_App_Spec.md
// ============================================================

export interface Dairy {
  id: string;
  name: string;
  address: string;
}

export interface Samiti {
  id: string;
  code: string;
  name: string;
  village: string;
  dairy_id: string;
  delivery_mode: 'vehicle' | 'self';
  active: boolean;
}

export interface Vehicle {
  id: string;
  vehicle_no: string;
  driver_name: string;
  active: boolean;
}

export interface VehicleSamitiMap {
  id: string;
  vehicle_id: string;
  samiti_id: string;
  sequence_no: number | null;
}

export interface MilkEntry {
  id: string;
  date: string; // ISO date string: 'YYYY-MM-DD'
  shift: 'morning' | 'evening';
  samiti_id: string;
  vehicle_id: string | null; // null for self-delivery samitis
  quantity_litres: number;
  no_of_cans: number;
  entered_by: string; // user_id
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface MilkTest {
  id: string;
  milk_entry_id: string; // FK → MilkEntry
  samiti_id: string; // denormalized for easy querying
  fat_pct: number;
  snf_pct: number;
  lacto_value: number;
  tested_by: string; // user_id
  created_at: string;
  // Flag/Void fields
  is_voided: boolean;
  voided_reason: string | null;
  voided_by: string | null;
  voided_at: string | null;
}

export interface QualityThreshold {
  id: string;
  effective_date: string; // 'YYYY-MM-DD'
  min_fat_pct: number;
  min_snf_pct: number;
  min_lacto_value: number;
  set_by: string; // admin user_id
  created_at: string;
}

export interface RateChart {
  id: string;
  effective_date: string; // 'YYYY-MM-DD'
  fat_pct_from: number;
  fat_pct_to: number;
  snf_pct_from: number;
  snf_pct_to: number;
  rate_per_litre: number;
  set_by: string; // admin user_id
  created_at: string;
}

export interface Payment {
  id: string;
  samiti_id: string;
  period_start: string; // 'YYYY-MM-DD'
  period_end: string;   // 'YYYY-MM-DD'
  total_litres: number;
  avg_fat: number;
  avg_snf: number;
  rate_applied: number;
  total_amount: number;
  status: 'draft' | 'finalized' | 'paid';
  generated_at: string;
}

export interface User {
  id: string;
  phone: string;
  password_hash: string;
  role: 'admin' | 'entry_operator' | 'testing_user';
  name: string;
  active: boolean;
  preferred_language: 'en' | 'hi';
  is_locked: boolean;        // locked after 5 failed login attempts
  failed_login_attempts: number;
}

export interface AuditLog {
  id: string;
  entity_type: string;       // e.g. 'MilkEntry', 'MilkTest', 'Vehicle'
  entity_id: string;
  user_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

// ============================================================
// Local offline queue type (SQLite)
// ============================================================
export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  created_at: string;
  synced: boolean;
}

// ============================================================
// App-specific utility types
// ============================================================
export type Shift = 'morning' | 'evening';
export type UserRole = 'admin' | 'entry_operator' | 'testing_user';
export type DeliveryMode = 'vehicle' | 'self';
export type PaymentStatus = 'draft' | 'finalized' | 'paid';
export type Language = 'en' | 'hi';

export interface AuthSession {
  user: User;
  token: string;
}
