import { supabase } from '../db/supabase';
import { writeAuditLog } from './audit';
import type { User, UserRole, Language } from '../types';

// ─── Users API ─────────────────────────────────────────────────

export type UserWithoutHash = Omit<User, 'password_hash'>;

export async function getUsers(activeOnly = false): Promise<UserWithoutHash[]> {
  let query = supabase
    .from('users')
    .select('id, phone, role, name, active, preferred_language, is_locked, failed_login_attempts, created_at, updated_at')
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as UserWithoutHash[];
}

export async function getUserById(id: string): Promise<UserWithoutHash> {
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, role, name, active, preferred_language, is_locked, failed_login_attempts, created_at, updated_at')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as UserWithoutHash;
}

export async function createUser(
  payload: {
    phone: string;
    password: string;
    name: string;
    role: UserRole;
    preferred_language: Language;
  },
  adminUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_user', {
    p_phone: payload.phone,
    p_password: payload.password,
    p_name: payload.name,
    p_role: payload.role,
    p_preferred_language: payload.preferred_language,
  });
  if (error) throw error;

  const newUserId = data as string;

  // Log audit
  await writeAuditLog({
    entity_type: 'User',
    entity_id: newUserId,
    user_id: adminUserId,
    action: 'INSERT',
    old_value: null,
    new_value: { phone: payload.phone, name: payload.name, role: payload.role, preferred_language: payload.preferred_language },
  });

  return newUserId;
}

export async function updateUser(
  id: string,
  payload: Partial<Pick<User, 'name' | 'role' | 'active' | 'preferred_language'>>,
  adminUserId: string
): Promise<void> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('users')
    .select('id, name, role, active, preferred_language')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('users')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, name, role, active, preferred_language')
    .single();

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'User',
    entity_id: id,
    user_id: adminUserId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: data,
  });
}

export async function deactivateUser(id: string, adminUserId: string): Promise<void> {
  // Fetch old data
  const { data: oldData } = await supabase
    .from('users')
    .select('id, active')
    .eq('id', id)
    .single();

  const { data, error } = await supabase
    .from('users')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, active')
    .single();

  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'User',
    entity_id: id,
    user_id: adminUserId,
    action: 'UPDATE',
    old_value: oldData,
    new_value: data,
  });
}

export async function unlockUser(id: string, adminUserId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_unlock_user', { p_user_id: id });
  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'User',
    entity_id: id,
    user_id: adminUserId,
    action: 'UPDATE',
    old_value: { is_locked: true },
    new_value: { is_locked: false },
  });
}

export async function resetPassword(id: string, newPassword: string, adminUserId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_password', {
    p_user_id: id,
    p_new_password: newPassword,
  });
  if (error) throw error;

  // Log audit
  await writeAuditLog({
    entity_type: 'User',
    entity_id: id,
    user_id: adminUserId,
    action: 'UPDATE',
    old_value: { password_reset: false },
    new_value: { password_reset: true },
  });
}
